import { useState } from 'react';
import { Upload, Image as ImageIcon, Loader2, X, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
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
  datasetType?: 'language' | 'general';
  languageName?: string;
  languageCode?: string;
  detectedLanguages?: string[];
  validationWarnings?: string[];
  addedColumns?: string[];
};

// Each image in the queue goes through these states:
// pending  → the user selected it but OCR hasn't started yet
// processing → OCR is actively running for this image
// done     → OCR finished successfully (data is populated)
// error    → OCR failed (errorMsg is populated)
type QueueStatus = 'pending' | 'processing' | 'done' | 'error';

type ImageQueueItem = {
  // Unique ID so React can keep track of each item in the list
  id: string;
  file: File;
  // A data-URL (base64) used to show the thumbnail preview
  preview: string;
  status: QueueStatus;
  // The extracted table data — null until OCR finishes
  data: ExtractedData | null;
  // Human-readable status message shown below each thumbnail
  statusMsg: string;
  errorMsg: string;
};

export default function UploadPage({ onSaved, onClose }: UploadPageProps) {
  // imageQueue holds every image the user has selected, along with its current state
  const [imageQueue, setImageQueue] = useState<ImageQueueItem[]>([]);
  // isProcessing is true while the OCR pipeline is running (disables buttons)
  const [isProcessing, setIsProcessing] = useState(false);

  const { user } = useAuth();

  // ─── Helpers ────────────────────────────────────────────────────────────────

  // Wraps FileReader in a Promise so we can use async/await with it
  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });

  // Generates preview URLs for all selected files and adds them to the queue
  const readPreviewsAndEnqueue = async (files: File[]) => {
    const newItems: ImageQueueItem[] = await Promise.all(
      files.map(async (file) => {
        const preview = await fileToBase64(file);
        return {
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          preview,
          status: 'pending' as QueueStatus,
          data: null,
          statusMsg: 'Ready to extract',
          errorMsg: '',
        };
      })
    );

    // Append to existing queue so users can keep adding more images
    setImageQueue((prev) => [...prev, ...newItems]);
  };

  // Removes a single image from the queue before processing starts
  const removeFromQueue = (id: string) => {
    setImageQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Clears the entire queue and resets the page to its initial state
  const resetAll = () => {
    setImageQueue([]);
  };

  // ─── Tag detection ───────────────────────────────────────────────────────────

  // Looks at the extracted text and column names to auto-assign category tags.
  // This runs entirely on the frontend — no AI needed for this step.
  const detectTags = (text: string, columns: string[]): string[] => {
    const tags: string[] = [];
    const lowerText = text.toLowerCase();
    const allContent = `${text} ${columns.join(' ')}`;

    if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(allContent)) tags.push('Languages');
    if (/[€$¥£₹]|\bprice\b|\bcost\b|\btotal\b|\bamount\b/i.test(allContent)) tags.push('Expenses');
    if (/\b(qty|quantity|stock|inventory)\b/i.test(allContent)) tags.push('Inventory');
    if (/\b(travel|trip|flight|hotel|booking|destination)\b/i.test(lowerText)) tags.push('Travel');
    if (/\b(shirt|pants|dress|clothing|shoes|jacket)\b/i.test(lowerText)) tags.push('Shopping');
    if (/\b(recipe|ingredients|food|meal|cooking)\b/i.test(lowerText)) tags.push('Recipes');
    if (/\b(weight|height|calories|exercise|fitness)\b/i.test(lowerText)) tags.push('Fitness');
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(allContent)) tags.push('Dated Records');

    return tags.length > 0 ? tags : ['General'];
  };

  // ─── Column visibility filter ────────────────────────────────────────────────

  // AI sometimes adds extra columns that end up completely empty.
  // This hides those empty AI-added columns while always keeping original columns.
  const filterVisibleColumns = (
    allColumns: string[],
    rows: Record<string, string>[],
    addedColumns: string[] = []
  ) => {
    return allColumns.filter((col) => {
      if (!addedColumns.includes(col)) return true;
      return rows.some((row) => typeof row[col] === 'string' && row[col].trim() !== '');
    });
  };

  // ─── Pipeline result normalizer ──────────────────────────────────────────────

  // Takes the raw JSON from the OCR edge function and converts it into our
  // clean ExtractedData shape. Both "fast" and "full" responses go through this.
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

  // ─── OCR pipeline call ───────────────────────────────────────────────────────

  // Calls the Supabase edge function with a single image.
  // mode = "fast" → quick first pass (always run)
  // mode = "full" → enrichment pass (only for language tables)
  const callPipeline = async (imageBase64: string, mode: 'fast' | 'full') => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-extract`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ imageBase64, mode }),
      }
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`OCR failed (${response.status}): ${responseText}`);
    }
    return JSON.parse(responseText);
  };

  // ─── Queue item state updater ────────────────────────────────────────────────

  // A small helper that updates a single item in the queue by its ID.
  // Using a function like this instead of duplicating the map() logic everywhere
  // keeps the code DRY and easier to read.
  const updateItem = (
    id: string,
    patch: Partial<Omit<ImageQueueItem, 'id' | 'file' | 'preview'>>
  ) => {
    setImageQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  // ─── Process all images ──────────────────────────────────────────────────────

  // Loops through every pending image in the queue and runs the OCR pipeline
  // on each one sequentially. We do them one-at-a-time (not parallel) to avoid
  // hammering the OpenAI API and blowing through rate limits.
  const processAll = async () => {
    if (!user) return;

    setIsProcessing(true);

    const pendingItems = imageQueue.filter((item) => item.status === 'pending');

    for (const item of pendingItems) {
      // Mark this image as "in progress" so the user can see which one is running
      updateItem(item.id, { status: 'processing', statusMsg: 'Extracting table...' });

      try {
        const imageBase64 = await fileToBase64(item.file);

        // ── Fast pass: always run, shows results quickly ──
        const fastResult = await callPipeline(imageBase64, 'fast');
        const fastData = buildExtractedDataFromResult(fastResult);

        // Show the fast result immediately so the user isn't staring at a spinner
        updateItem(item.id, { data: fastData });

        const isLanguage = fastData.datasetType === 'language';

        if (isLanguage) {
          const langName = fastData.languageName || 'detected language';
          updateItem(item.id, {
            statusMsg: `Language table (${langName}) — enriching...`,
          });

          // ── Full pass: only for language tables, adds extra columns ──
          const fullResult = await callPipeline(imageBase64, 'full');
          const fullData = buildExtractedDataFromResult(fullResult);

          // Only swap out the fast result if the full result actually has data
          if (fullData.tableData.length > 0 && fullData.columnNames.length > 0) {
            updateItem(item.id, {
              data: fullData,
              status: 'done',
              statusMsg:
                fullData.addedColumns && fullData.addedColumns.length > 0
                  ? `Enriched with ${fullData.addedColumns.join(', ')}`
                  : `Language data extracted (${langName})`,
            });
          } else {
            updateItem(item.id, {
              status: 'done',
              statusMsg: `Language data extracted (${langName})`,
            });
          }
        } else {
          updateItem(item.id, {
            status: 'done',
            statusMsg: 'Table extracted successfully',
          });
        }
      } catch (err) {
        // If a single image fails, mark it as errored and continue with the rest
        updateItem(item.id, {
          status: 'error',
          statusMsg: 'Extraction failed',
          errorMsg: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    setIsProcessing(false);
  };

  // ─── Save a single table ─────────────────────────────────────────────────────

  // Persists one extracted table to Supabase. Called either by "Save All" or
  // by an individual save button on each result card.
  const saveSingleTable = async (data: ExtractedData): Promise<boolean> => {
    if (!user) return false;

    const payload = {
      user_id: user.id,
      table_data: data.tableData,
      column_names: data.columnNames,
      auto_tags: data.autoTags,
      ocr_confidence: data.confidence,
      row_count: data.tableData.length,
      column_count: data.columnNames.length,
      dataset_type: data.datasetType ?? 'general',
      language_code: data.languageCode ?? null,
      language_name: data.languageName ?? null,
      detected_languages: data.detectedLanguages ?? [],
      added_columns: data.addedColumns ?? [],
      validation_warnings: data.validationWarnings ?? [],
    };

    const { error } = await supabase.from('table_snapshots').insert(payload);
    if (error) {
      console.error('Supabase insert error:', error);
      return false;
    }
    return true;
  };

  // ─── Save all successfully extracted tables ──────────────────────────────────

  const saveAll = async () => {
    if (!user) return;

    // Only save images that completed OCR and actually have row data
    const readyItems = imageQueue.filter(
      (item) => item.status === 'done' && item.data && item.data.tableData.length > 0
    );

    if (readyItems.length === 0) return;

    setIsProcessing(true);

    let savedCount = 0;
    for (const item of readyItems) {
      const success = await saveSingleTable(item.data!);
      if (success) savedCount++;
    }

    setIsProcessing(false);

    if (savedCount > 0) {
      resetAll();
      onSaved?.();
    } else {
      alert('Failed to save tables. Please try again.');
    }
  };

  // ─── File input handler ──────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);

    // Filter to only image files and warn the user if any non-images slipped in
    const imageFiles = selectedFiles.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length < selectedFiles.length) {
      alert('Some files were skipped — only image files are accepted.');
    }

    if (imageFiles.length === 0) return;

    readPreviewsAndEnqueue(imageFiles);

    // Reset the input so the same file can be selected again if needed
    e.target.value = '';
  };

  // ─── Derived state ───────────────────────────────────────────────────────────

  const pendingCount = imageQueue.filter((i) => i.status === 'pending').length;
  const doneCount = imageQueue.filter((i) => i.status === 'done').length;
  const readyToSave = imageQueue.filter(
    (i) => i.status === 'done' && i.data && i.data.tableData.length > 0
  ).length;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2 dark:text-white">
              Upload Table Images
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Select one or more images — each table is extracted using AI
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

        {/* Drop zone — always visible so the user can keep adding images */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 dark:bg-gray-900 dark:border-gray-800 mb-6">
          <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
            Extraction mode: <span className="font-semibold">Fast + Enrichment pipeline</span>
            {imageQueue.length > 0 && (
              <span className="ml-3 text-blue-600 dark:text-blue-400 font-semibold">
                {imageQueue.length} image{imageQueue.length > 1 ? 's' : ''} selected
                {doneCount > 0 && ` · ${doneCount} extracted`}
              </span>
            )}
          </div>

          {/* Clickable drop zone */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer dark:border-gray-700 dark:hover:border-blue-500">
            <input
              type="file"
              accept="image/*"
              multiple              // ← This is the key change: allows selecting many files at once
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
              disabled={isProcessing}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4 dark:text-gray-500" />
              <p className="text-gray-600 mb-2 dark:text-gray-300">
                Click to select images <span className="text-blue-600 font-medium dark:text-blue-400">(you can pick multiple)</span>
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                PNG, JPG, WEBP up to 10MB each
              </p>
            </label>
          </div>

          {/* Action buttons — shown once at least one image is queued */}
          {imageQueue.length > 0 && (
            <div className="mt-4 flex gap-3 flex-wrap">
              {pendingCount > 0 && (
                <button
                  onClick={processAll}
                  disabled={isProcessing}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Extract {pendingCount} Image{pendingCount > 1 ? 's' : ''}
                    </>
                  )}
                </button>
              )}

              {readyToSave > 0 && (
                <button
                  onClick={saveAll}
                  disabled={isProcessing}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Saving...' : `Save ${readyToSave} Table${readyToSave > 1 ? 's' : ''}`}
                </button>
              )}

              {!isProcessing && (
                <button
                  onClick={resetAll}
                  className="px-4 py-3 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-gray-200"
                >
                  Clear All
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results — one card per image, stacked vertically */}
        {imageQueue.length > 0 && (
          <div className="space-y-6">
            {imageQueue.map((item, index) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-lg border border-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-hidden"
              >
                {/* Card header: thumbnail + file name + status */}
                <div className="flex items-center gap-4 p-4 border-b border-gray-100 dark:border-gray-800">
                  {/* Small thumbnail */}
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      Image {index + 1}: {item.file.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {/* Status icon changes depending on what stage we're in */}
                      {item.status === 'processing' && (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      )}
                      {item.status === 'done' && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                      {item.status === 'error' && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {item.statusMsg}
                      </span>
                    </div>
                  </div>

                  {/* Only allow removing images that haven't started processing yet */}
                  {item.status === 'pending' && !isProcessing && (
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                      title="Remove this image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Error message if OCR failed */}
                {item.status === 'error' && item.errorMsg && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-900/30">
                    <p className="text-sm text-red-700 dark:text-red-400">{item.errorMsg}</p>
                  </div>
                )}

                {/* Extracted data — shown once OCR produces a result */}
                {item.data && (
                  <div className="p-6">
                    {/* Metadata badges */}
                    <div className="mb-4 flex flex-wrap gap-2 items-center">
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {item.data.confidence}% confidence
                      </span>

                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm dark:bg-gray-800 dark:text-gray-200">
                        {item.data.datasetType ?? 'general'}
                      </span>

                      {item.data.languageName && (
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm dark:bg-purple-900/30 dark:text-purple-300">
                          {item.data.languageName}
                        </span>
                      )}

                      {item.data.addedColumns && item.data.addedColumns.length > 0 && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm dark:bg-green-900/30 dark:text-green-300">
                          Enriched: {item.data.addedColumns.join(', ')}
                        </span>
                      )}

                      {/* Auto-detected tags */}
                      {item.data.autoTags.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm dark:bg-blue-900/30 dark:text-blue-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Validation warnings from the AI */}
                    {item.data.validationWarnings && item.data.validationWarnings.length > 0 && (
                      <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/40 dark:bg-yellow-900/10">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                          Warnings
                        </p>
                        <ul className="text-sm text-yellow-700 dark:text-yellow-200 space-y-1">
                          {item.data.validationWarnings.map((w, i) => (
                            <li key={i}>• {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Scrollable table preview */}
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-sm bg-white dark:bg-gray-900">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            {item.data.columnNames.map((col) => (
                              <th
                                key={col}
                                className="text-left p-2 font-semibold text-gray-900 dark:text-white"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {item.data.tableData.length > 0 ? (
                            item.data.tableData.map((row, rowIdx) => (
                              <tr
                                key={rowIdx}
                                className="border-b border-gray-100 dark:border-gray-800"
                              >
                                {item.data!.columnNames.map((col) => (
                                  <td key={col} className="p-2 text-gray-900 dark:text-gray-100">
                                    {row[col] ?? ''}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                className="p-2 text-gray-500 dark:text-gray-400"
                                colSpan={item.data.columnNames.length}
                              >
                                No table could be extracted from this image.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bottom Save All button — shown when results are ready, avoids scrolling back up */}
        {readyToSave > 0 && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={saveAll}
              disabled={isProcessing}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Saving...' : `Save All ${readyToSave} Table${readyToSave > 1 ? 's' : ''} to My Tables`}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-gray-200"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
