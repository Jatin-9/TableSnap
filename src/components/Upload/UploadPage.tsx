import { useState } from 'react';
import { Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type ExtractedData = {
  tableData: Record<string, string>[];
  columnNames: string[];
  autoTags: string[];
  confidence: number;
  rawText: string;
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

  // CHANGE 1:
  // Added helper to convert uploaded image into base64
  // because the OpenAI edge function expects JSON with imageBase64.
  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });

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

  const processOCR = async () => {
    if (!file || !user) return;

    setLoading(true);
    setOcrStatus('Uploading image for AI extraction...');

    try {
      const imageBase64 = await fileToBase64(file);

      // CHANGE 2:
      // If JWT verification is disabled in the edge function,
      // only apikey + content-type are needed here.
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-extract`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            imageBase64,
          }),
        }
      );

      const responseText = await response.text();
      console.log('OCR raw response:', response.status, responseText);

      if (!response.ok) {
        alert(`OCR failed (${response.status}): ${responseText}`);
        setOcrStatus('OCR failed');
        return;
      }

      const result = JSON.parse(responseText);

      if (!result?.result) {
        alert('No result returned from AI');
        setOcrStatus('OCR failed');
        return;
      }

      // CHANGE 3:
      // Strip markdown fences if AI wraps JSON in ```json ... ```
      const cleaned = result.result.replace(/```json|```/g, '').trim();

      let parsed: { columns?: string[]; rows?: Record<string, string>[] };

      try {
        parsed = JSON.parse(cleaned);
      } catch (parseError) {
        console.error('Failed to parse AI JSON:', cleaned);
        alert('AI returned invalid JSON. Check console for details.');
        setOcrStatus('OCR failed');
        return;
      }

      const columnNames =
        Array.isArray(parsed.columns) && parsed.columns.length > 0
          ? parsed.columns
          : ['Text'];

      const tableData =
        Array.isArray(parsed.rows) && parsed.rows.length > 0
          ? parsed.rows
          : [];

      const rawText = JSON.stringify(parsed, null, 2);
      const autoTags = detectTags(rawText, columnNames);

      setExtractedData({
        tableData,
        columnNames,
        autoTags,
        confidence: 90,
        rawText,
      });

      setOcrStatus('AI extraction complete');
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
    // CHANGE 4:
    // Improved dark mode on page background by changing gradient stops too.
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 dark:text-white">
            Upload Table Image
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Upload a photo of any table and extract data using AI
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CHANGE 5:
              Upload card now has proper dark background + border */}
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 dark:bg-gray-900 dark:border-gray-800">
            <h2 className="text-xl font-bold text-gray-900 mb-4 dark:text-white">
              Photo Upload
            </h2>

            <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
              Extraction mode: <span className="font-semibold">OpenAI Vision</span>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer dark:border-gray-700 dark:hover:border-blue-500">
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
                    <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4 dark:text-gray-500" />
                    <p className="text-gray-600 mb-2 dark:text-gray-300">
                      Click to upload an image
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      PNG, JPG, WEBP up to 10MB
                    </p>
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
              <div className="mt-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                {ocrStatus}
              </div>
            )}
          </div>

          {extractedData && (
            // CHANGE 6:
            // Extracted data card fully updated for dark mode.
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 dark:bg-gray-900 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 mb-4 dark:text-white">
                Extracted Data
              </h2>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Extraction Confidence
                  </span>
                  <span className="text-sm font-bold text-green-600 dark:text-green-400">
                    {extractedData.confidence}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${Math.min(extractedData.confidence, 100)}%` }}
                  />
                </div>
              </div>

              <div className="mb-4">
                <span className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-300">
                  Auto Tags
                </span>
                <div className="flex flex-wrap gap-2">
                  {extractedData.autoTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium dark:bg-blue-900/30 dark:text-blue-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* CHANGE 7:
                  Table wrapper, headers, and cells now have explicit light/dark colors
                  so text does not become invisible. */}
              <div className="overflow-x-auto mb-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm bg-white dark:bg-gray-900">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      {extractedData.columnNames.map((col) => (
                        <th
                          key={col}
                          className="text-left p-2 font-semibold text-gray-900 dark:text-white bg-white dark:bg-gray-900"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.tableData.length > 0 ? (
                      extractedData.tableData.map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-800">
                          {extractedData.columnNames.map((col) => (
                            <td
                              key={col}
                              className="p-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                            >
                              {row[col] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          className="p-2 text-gray-500 dark:text-gray-400"
                          colSpan={extractedData.columnNames.length}
                        >
                          No table could be extracted from this image.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* CHANGE 8:
                  Raw AI output area now also has explicit dark mode text/background colors. */}
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                  View raw AI output
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs bg-gray-50 text-gray-900 p-3 rounded-lg border border-gray-200 overflow-auto max-h-48 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
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