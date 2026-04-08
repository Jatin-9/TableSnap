import { useState } from 'react';
import { Upload, Image as ImageIcon, Loader2, X } from 'lucide-react'; // CHANGE: added X icon for close button
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

// CHANGE: UploadPage now accepts callbacks from parent modal/layout
type UploadPageProps = {
  onSaved?: () => void;
  onClose?: () => void;
};

type ExtractedData = {
  tableData: Record<string, string>[];
  columnNames: string[];
  autoTags: string[];
  confidence: number;
  rawText: string;
};

// CHANGE: receive onSaved and onClose props
export default function UploadPage({ onSaved, onClose }: UploadPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  const { user } = useAuth();

  // CHANGE: helper to fully reset upload UI after save/cancel
  const resetUploadState = () => {
    setFile(null);
    setPreview(null);
    setExtractedData(null);
    setOcrStatus('');
  };

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
    // Convert image to base64
    const imageBase64 = await fileToBase64(file);

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

    // NEW RESPONSE STRUCTURE
    const result = JSON.parse(responseText);

    /**
     * Before:
     * result.result → string JSON from AI
     *
     * Now:
     * result.final → actual usable table
     * result.classification → what type of data it is
     * result.validation → warnings / checks
     */

    const finalTable = result.final;

    if (!finalTable || !finalTable.columns || !finalTable.rows) {
      alert('AI did not return valid structured data');
      setOcrStatus('OCR failed');
      return;
    }


    // COLUMN + ROW NORMALIZATION

    // This ensures every row has the same shape as columns
    const columnNames =
      Array.isArray(finalTable.columns) && finalTable.columns.length > 0
        ? finalTable.columns
        : ['Text'];

    const tableData =
      Array.isArray(finalTable.rows) && finalTable.rows.length > 0
        ? finalTable.rows.map((row: Record<string, any>) => {
            const normalizedRow: Record<string, string> = {};

            columnNames.forEach((col, index) => {
              // If key exists, use it
              if (row[col] !== undefined) {
                normalizedRow[col] = String(row[col]);
                return;
              }

              // Otherwise fallback by index (safety fallback)
              const rowValues = Object.values(row);
              normalizedRow[col] =
                rowValues[index] !== undefined
                  ? String(rowValues[index])
                  : '';
            });

            return normalizedRow;
          })
        : [];


    //  METADATA FROM PIPELINE

    const classification = result.classification;
    const validation = result.validation;

    // we can later use this in UI if we want
    const datasetType = classification?.datasetType ?? 'general';
    const language = classification?.languageName ?? '';

    const warnings = validation?.warnings ?? [];


    //  TAG DETECTION (your existing logic)

    const rawText = JSON.stringify(finalTable, null, 2);
    const autoTags = detectTags(rawText, columnNames);


    //  FINAL STATE SET

    setExtractedData({
      tableData,
      columnNames,
      autoTags,
      confidence: 90, // still static for now
      rawText,
    });

    /**
     * Optional: we can log these to understand behavior
     */
    console.log('Classification:', classification);
    console.log('Validation:', validation);
    console.log('Warnings:', warnings);

    // Update status message depending on what happened
    if (datasetType === 'language') {
      setOcrStatus(
        warnings.length > 0
          ? 'Language data extracted (with warnings)'
          : `Language data extracted (${language || 'detected'})`
      );
    } else {
      setOcrStatus('Table extracted successfully');
    }
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

      // CHANGE: instead of navigate('/dashboard'), reset and notify parent
      resetUploadState();
      onSaved?.();
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* CHANGE: header now supports close button when opened in modal */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2 dark:text-white">
              Upload Table Image
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Upload a photo of any table and extract data using AI
            </p>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              aria-label="Close upload modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                  View raw AI output
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs bg-gray-50 text-gray-900 p-3 rounded-lg border border-gray-200 overflow-auto max-h-48 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
                  {extractedData.rawText}
                </pre>
              </details>

              {/* CHANGE: added Cancel button for modal flow */}
              <div className="flex gap-3">
                <button
                  onClick={saveTable}
                  disabled={loading || extractedData.tableData.length === 0}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save to My Tables'}
                </button>

                <button
                  onClick={() => {
                    resetUploadState();
                    onClose?.();
                  }}
                  className="px-4 py-3 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}