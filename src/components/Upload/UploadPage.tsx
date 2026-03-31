import { useState } from 'react';
import { Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createWorker, PSM } from 'tesseract.js';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type ExtractedData = {
  tableData: Record<string, string>[];
  columnNames: string[];
  autoTags: string[];
  confidence: number;
  rawText: string;
};

type OCRWord = {
  text: string;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

type PreparedWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  centerX: number;
  centerY: number;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  const navigate = useNavigate();
  const { user } = useAuth();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] ?? null;
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      alert('Please upload a valid image file.');
      return;
    }

    setFile(selectedFile);
    setExtractedData(null);
    setOcrStatus('');

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const detectTags = (text: string, columns: string[]): string[] => {
    const tags: string[] = [];
    const lowerText = text.toLowerCase();
    const allContent = `${text} ${columns.join(' ')}`;

    if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(allContent)) {
      tags.push('Languages');
    }
    if (/[€$¥£₹]|\bprice\b|\bcost\b|\btotal\b|\bamount\b/i.test(allContent)) {
      tags.push('Expenses');
    }
    if (/\b(qty|quantity|stock|inventory)\b/i.test(allContent)) {
      tags.push('Inventory');
    }
    if (/\b(travel|trip|flight|hotel|booking|destination)\b/i.test(lowerText)) {
      tags.push('Travel');
    }
    if (/\b(shirt|pants|dress|clothing|shoes|jacket)\b/i.test(lowerText)) {
      tags.push('Shopping');
    }
    if (/\b(recipe|ingredients|food|meal|cooking)\b/i.test(lowerText)) {
      tags.push('Recipes');
    }
    if (/\b(weight|height|calories|exercise|fitness)\b/i.test(lowerText)) {
      tags.push('Fitness');
    }
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(allContent)) {
      tags.push('Dated Records');
    }

    return tags.length > 0 ? tags : ['General'];
  };

  const preprocessImage = (inputFile: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = 2;

          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not create canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            if (gray > 165) gray = 255;
            else if (gray < 95) gray = 0;
            else gray = Math.min(255, Math.max(0, (gray - 95) * 2));

            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          }

          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
        img.src = reader.result as string;
      };

      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(inputFile);
    });
  };

  const preprocessWords = (words: OCRWord[]): PreparedWord[] => {
    return words
      .filter((word) => word.text && word.text.trim().length > 0 && word.bbox)
      .map((word) => ({
        text: word.text.trim(),
        x0: word.bbox!.x0,
        y0: word.bbox!.y0,
        x1: word.bbox!.x1,
        y1: word.bbox!.y1,
        centerX: (word.bbox!.x0 + word.bbox!.x1) / 2,
        centerY: (word.bbox!.y0 + word.bbox!.y1) / 2,
      }));
  };

  const groupWordsIntoRows = (words: PreparedWord[], yTolerance = 18): PreparedWord[][] => {
    const sorted = [...words].sort((a, b) => {
      const yDiff = a.centerY - b.centerY;
      if (Math.abs(yDiff) > 1) return yDiff;
      return a.x0 - b.x0;
    });

    const rows: PreparedWord[][] = [];

    for (const word of sorted) {
      let bestRowIndex = -1;
      let bestDistance = Infinity;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const avgY = row.reduce((sum, item) => sum + item.centerY, 0) / row.length;
        const distance = Math.abs(avgY - word.centerY);

        if (distance <= yTolerance && distance < bestDistance) {
          bestDistance = distance;
          bestRowIndex = i;
        }
      }

      if (bestRowIndex >= 0) {
        rows[bestRowIndex].push(word);
      } else {
        rows.push([word]);
      }
    }

    return rows
      .map((row) => [...row].sort((a, b) => a.x0 - b.x0))
      .sort((a, b) => {
        const avgA = a.reduce((sum, item) => sum + item.centerY, 0) / a.length;
        const avgB = b.reduce((sum, item) => sum + item.centerY, 0) / b.length;
        return avgA - avgB;
      });
  };

  const inferColumnAnchors = (rows: PreparedWord[][], xTolerance = 45): number[] => {
    const anchors: number[] = [];

    for (const row of rows) {
      for (const word of row) {
        const existingIndex = anchors.findIndex(
          (anchor) => Math.abs(anchor - word.x0) <= xTolerance
        );

        if (existingIndex >= 0) {
          anchors[existingIndex] = Math.round((anchors[existingIndex] + word.x0) / 2);
        } else {
          anchors.push(word.x0);
        }
      }
    }

    return anchors.sort((a, b) => a - b);
  };

  const assignWordsToColumns = (rows: PreparedWord[][], anchors: number[]) => {
    if (anchors.length === 0) {
      return {
        tableData: [] as Record<string, string>[],
        columnNames: ['Text'],
      };
    }

    const columnNames = anchors.map((_, index) => `Column ${index + 1}`);

    const tableData = rows.map((row) => {
      const cells = Array.from({ length: anchors.length }, () => '');

      for (const word of row) {
        let bestIndex = 0;
        let bestDistance = Math.abs(word.x0 - anchors[0]);

        for (let i = 1; i < anchors.length; i++) {
          const distance = Math.abs(word.x0 - anchors[i]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
          }
        }

        cells[bestIndex] = cells[bestIndex]
          ? `${cells[bestIndex]} ${word.text}`
          : word.text;
      }

      const rowObject: Record<string, string> = {};
      columnNames.forEach((col, idx) => {
        rowObject[col] = cells[idx] ?? '';
      });

      return rowObject;
    });

    return { tableData, columnNames };
  };

  const fallbackTextToTable = (text: string) => {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return {
        tableData: [] as Record<string, string>[],
        columnNames: ['Text'],
      };
    }

    return {
      tableData: lines.map((line) => ({ Text: line })),
      columnNames: ['Text'],
    };
  };

  const processOCR = async () => {
  if (!file || !user) return;

  setLoading(true);
  setOcrStatus('Uploading image for OCR...');

  try {
    const formData = new FormData();
    formData.append('file', file);

    const { data, error } = await supabase.functions.invoke('ocr-extract', {
      body: formData,
    });

    if (error) {
      console.error('Edge function OCR error:', error);
      throw new Error(error.message || 'OCR function failed');
    }

    const columnNames = Array.isArray(data?.columnNames) ? data.columnNames : ['Text'];
    const tableData = Array.isArray(data?.tableData) ? data.tableData : [];
    const rawText = typeof data?.rawText === 'string' ? data.rawText : '';
    const confidence = typeof data?.confidence === 'number' ? data.confidence : 0;

    const autoTags = detectTags(rawText, columnNames);

    setExtractedData({
      tableData,
      columnNames,
      autoTags,
      confidence,
      rawText,
    });

    setOcrStatus('OCR complete');
  } catch (error) {
    console.error('OCR Error:', error);
    alert(
      `Error processing image: ${
        error instanceof Error ? error.message : JSON.stringify(error)
      }`
    );
    setOcrStatus('OCR failed');
  } finally {
    setLoading(false);
  }
};

  const saveTable = async () => {
    if (!extractedData || !user) return;

    setLoading(true);

    try {
      const payload = {
        user_id: user.id,
        table_data: extractedData.tableData,
        column_names: extractedData.columnNames,
        auto_tags: extractedData.autoTags,
        ocr_confidence: extractedData.confidence,
        row_count: extractedData.tableData.length,
        column_count: extractedData.columnNames.length,
      };

      const { error } = await supabase.from('table_snapshots').insert(payload);

      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }

      navigate('/dashboard');
    } catch (error) {
      console.error('Save Error full:', error);
      alert(
        `Error saving table: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Upload Table Image</h1>
          <p className="text-gray-600">Upload a photo of any table and extract data using OCR</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Photo Upload</h2>

            <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
              OCR languages: <span className="font-semibold">English + Japanese</span>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                {preview ? (
                  <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                ) : (
                  <div>
                    <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">Click to upload an image</p>
                    <p className="text-sm text-gray-400">PNG, JPG up to 10MB</p>
                  </div>
                )}
              </label>
            </div>

            {file && !extractedData && (
              <button
                onClick={processOCR}
                disabled={loading}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Extract Table Data
                  </>
                )}
              </button>
            )}

            {ocrStatus && (
              <div className="mt-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                {ocrStatus}
              </div>
            )}
          </div>

          {extractedData && (
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Extracted Data</h2>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">OCR Confidence</span>
                  <span className="text-sm font-bold text-green-600">
                    {extractedData.confidence}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${Math.min(extractedData.confidence, 100)}%` }}
                  />
                </div>
              </div>

              <div className="mb-4">
                <span className="text-sm font-medium text-gray-700 mb-2 block">Auto Tags</span>
                <div className="flex flex-wrap gap-2">
                  {extractedData.autoTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {extractedData.columnNames.map((col) => (
                        <th key={col} className="text-left p-2 font-semibold text-gray-900">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.tableData.length > 0 ? (
                      extractedData.tableData.map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          {extractedData.columnNames.map((col) => (
                            <td key={col} className="p-2 text-gray-700">
                              {row[col] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-2 text-gray-500" colSpan={extractedData.columnNames.length}>
                          No text could be extracted from this image.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">
                  View raw OCR text
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded-lg border border-gray-200 overflow-auto max-h-48">
                  {extractedData.rawText}
                </pre>
              </details>

              <button
                onClick={saveTable}
                disabled={loading || extractedData.tableData.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save to My Tables'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}