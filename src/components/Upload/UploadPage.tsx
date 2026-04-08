import { useState } from 'react';
import { Upload, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type UploadPageProps = {
  onSaved?: () => void;
  onClose?: () => void;
};

type PipelineClassification = {
  datasetType?: 'language' | 'general';
  languageName?: string;
  languageCode?: string;
  reasoning?: string;
};

type PipelineValidation = {
  isValid?: boolean;
  warnings?: string[];
};

type ExtractedData = {
  tableData: Record<string, string>[];
  columnNames: string[];
  autoTags: string[];
  confidence: number;
  rawText: string;

  // New metadata from pipeline
  datasetType?: 'language' | 'general';
  languageName?: string;
  languageCode?: string;
  detectedLanguages?: string[];
  validationWarnings?: string[];
  addedColumns?: string[];
};

export default function UploadPage({ onSaved, onClose }: UploadPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  const { user } = useAuth();

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

  // This hides AI-added columns that are completely empty.
  // Original columns are always kept.
  const filterVisibleColumns = (
    allColumns: string[],
    rows: Record<string, string>[],
    addedColumns: string[] = []
  ) => {
    return allColumns.filter((col) => {
      // Keep original / non-added columns no matter what
      if (!addedColumns.includes(col)) return true;

      // For added columns, only show if at least one row has data
      const hasAnyValue = rows.some((row) => {
        const value = row[col];
        return typeof value === 'string' && value.trim() !== '';
      });

      return hasAnyValue;
    });
  };

  // Small helper so both fast and full responses get normalized the same way
const buildExtractedDataFromResult = (result: any): ExtractedData => {
  const finalTable = result?.final;
  const classification: PipelineClassification = result?.classification ?? {};
  const validation: PipelineValidation = result?.validation ?? {};

  if (!finalTable || !Array.isArray(finalTable.columns) || !Array.isArray(finalTable.rows)) {
    throw new Error('AI did not return valid structured data');
  }

  const rawColumnNames =
    Array.isArray(finalTable.columns) && finalTable.columns.length > 0
      ? finalTable.columns.map((col: unknown) => String(col))
      : ['Text'];

  const normalizedRows =
    Array.isArray(finalTable.rows) && finalTable.rows.length > 0
      ? finalTable.rows.map((row: Record<string, any>) => {
          const normalizedRow: Record<string, string> = {};

          rawColumnNames.forEach((col, index) => {
            if (row[col] !== undefined && row[col] !== null) {
              normalizedRow[col] = String(row[col]);
              return;
            }

            const rowValues = Object.values(row);
            normalizedRow[col] =
              rowValues[index] !== undefined && rowValues[index] !== null
                ? String(rowValues[index])
                : '';
          });

          return normalizedRow;
        })
      : [];

  const addedColumns = Array.isArray(finalTable.addedColumns)
    ? finalTable.addedColumns.map((col: unknown) => String(col))
    : [];

  const visibleColumns = filterVisibleColumns(rawColumnNames, normalizedRows, addedColumns);

  const visibleRows = normalizedRows.map((row) => {
    const filteredRow: Record<string, string> = {};
    visibleColumns.forEach((col) => {
      filteredRow[col] = row[col] ?? '';
    });
    return filteredRow;
  });

  const languageName = classification.languageName ?? '';
  const languageCode = classification.languageCode ?? '';

  // For now we keep detectedLanguages simple:
  // one primary language if present, otherwise empty array.
  const detectedLanguages = languageName ? [languageName] : [];

  const rawText = JSON.stringify(result, null, 2);
  const autoTags = detectTags(rawText, visibleColumns);

  return {
    tableData: visibleRows,
    columnNames: visibleColumns,
    autoTags,
    confidence: 90,
    rawText,

    datasetType: classification.datasetType ?? 'general',
    languageName,
    languageCode,
    detectedLanguages,
    validationWarnings: Array.isArray(validation.warnings) ? validation.warnings : [],
    addedColumns,
  };
};

  const callPipeline = async (imageBase64: string, mode: 'fast' | 'full') => {
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
          mode,
        }),
      }
    );

    const responseText = await response.text();
    console.log(`${mode.toUpperCase()} OCR raw response:`, response.status, responseText);

    if (!response.ok) {
      throw new Error(`OCR failed (${response.status}): ${responseText}`);
    }

    return JSON.parse(responseText);
  };

  const processOCR = async () => {
    if (!file || !user) return;

    setLoading(true);
    setExtractedData(null);
    setOcrStatus('Uploading image and extracting table...');

    try {
      const imageBase64 = await fileToBase64(file);

      // -----------------------------
      // STEP 1: FAST PATH
      // -----------------------------
      // This gets the table visible quickly.
      const fastResult = await callPipeline(imageBase64, 'fast');
      const fastData = buildExtractedDataFromResult(fastResult);

      setExtractedData(fastData);

      const isLanguage = fastData.datasetType === 'language';
      const languageName = fastData.languageName || 'detected language';

      if (isLanguage) {
        setOcrStatus(`Language table detected (${languageName}). Enriching...`);
      } else {
        setOcrStatus('Table extracted successfully');
      }

      // -----------------------------
      // STEP 2: FULL PATH (only for language)
      // -----------------------------
      // We already show the fast result first, so the UI feels responsive.
      if (isLanguage) {
        const fullResult = await callPipeline(imageBase64, 'full');
        const fullData = buildExtractedDataFromResult(fullResult);

        // Only replace the fast result if the full result is actually useful.
        const hasRows = fullData.tableData.length > 0;
        const hasColumns = fullData.columnNames.length > 0;

        if (hasRows && hasColumns) {
          setExtractedData(fullData);
        }

        const warnings = fullData.validationWarnings ?? [];
        const addedColumns = fullData.addedColumns ?? [];

        if (warnings.length > 0) {
          setOcrStatus(
            addedColumns.length > 0
              ? `Language data enriched with warnings (${addedColumns.join(', ')})`
              : 'Language data extracted with warnings'
          );
        } else {
          setOcrStatus(
            addedColumns.length > 0
              ? `Language data enriched (${addedColumns.join(', ')})`
              : `Language data extracted (${languageName})`
          );
        }
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

      // New metadata fields
      dataset_type: extractedData.datasetType ?? 'general',
      language_code: extractedData.languageCode ?? null,
      language_name: extractedData.languageName ?? null,
      detected_languages: extractedData.detectedLanguages ?? [],
      added_columns: extractedData.addedColumns ?? [],
      validation_warnings: extractedData.validationWarnings ?? [],
    };

    const { error } = await supabase.from('table_snapshots').insert(payload);

    if (error) {
      console.error('Supabase insert error:', error);
      throw error;
    }

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
              Extraction mode: <span className="font-semibold">Fast + Enrichment pipeline</span>
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

              <div className="mb-4 flex flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Type:
                </span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium dark:bg-gray-800 dark:text-gray-200">
                  {extractedData.datasetType ?? 'general'}
                </span>

                {extractedData.languageName && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium dark:bg-purple-900/30 dark:text-purple-300">
                    {extractedData.languageName}
                  </span>
                )}

                {extractedData.addedColumns && extractedData.addedColumns.length > 0 && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium dark:bg-green-900/30 dark:text-green-300">
                    Enriched: {extractedData.addedColumns.join(', ')}
                  </span>
                )}
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

              {extractedData.validationWarnings &&
                extractedData.validationWarnings.length > 0 && (
                  <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/40 dark:bg-yellow-900/10">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                      Validation warnings
                    </p>
                    <ul className="text-sm text-yellow-700 dark:text-yellow-200 space-y-1">
                      {extractedData.validationWarnings.map((warning, idx) => (
                        <li key={idx}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

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