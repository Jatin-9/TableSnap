import { useState } from 'react';
import { Upload, Image as ImageIcon, Loader2, X, CheckCircle, AlertCircle, Trash2, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useUsage } from '../../hooks/useUsage';
import UpgradeModal from '../ui/UpgradeModal';
import { AiColumnHeader } from '../ui/AiColumnHeader';
// Vite resolves this to the worker file URL at build time.
// Importing it statically as a URL string means pdfjs can load the worker
// without any runtime bundler tricks — the PDF JS is still loaded lazily below.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

type QueueStatus = 'pending' | 'processing' | 'done' | 'error';

type ImageQueueItem = {
  id: string;
  file: File;
  preview: string;
  status: QueueStatus;
  data: ExtractedData | null;
  statusMsg: string;
  errorMsg: string;
};

// The result of processing one image through the fast pass.
// We store imageBase64 here so the full pass can reuse it without re-reading the file.
type FastPassResult = {
  item: ImageQueueItem;
  imageBase64: string;
  fastData: ExtractedData | null;
  success: boolean;
};

// How many images we process at the same time.
// 4 is safe for 500 RPM — each image makes 7 calls max, so 4 images = 28 calls,
// well within the per-minute limit even with some headroom for retries.
const BATCH_SIZE = 4;

// Hard cap on how many images a user can queue in one session.
// Keeps UI manageable and prevents accidental rate limit abuse.
const MAX_IMAGES = 10;

export default function UploadPage({ onSaved, onClose }: UploadPageProps) {
  const [imageQueue, setImageQueue] = useState<ImageQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Tracks which batch we are currently on so we can show progress to the user.
  // null means no processing is happening right now.
  const [batchInfo, setBatchInfo] = useState<{ current: number; total: number } | null>(null);

  const { user } = useAuth();
  const { canUpload, canStore, uploadsThisMonth, totalTables, incrementUploadCount, refetch } = useUsage();
  // Which limit the upgrade modal should explain: 'uploads' or 'storage', or null when hidden
  const [upgradeModal, setUpgradeModal] = useState<'uploads' | 'storage' | null>(null);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });

  // Converts each page of a PDF into a base64 PNG string.
  // Returns an array of data URLs — one per page, in order.
  // Rejects with an error message if the PDF has more than MAX_PDF_PAGES pages.
  const MAX_PDF_PAGES = 10;

  const pdfToImages = async (file: File): Promise<string[]> => {
    // Lazy-load pdfjs so the ~2 MB bundle only downloads when a PDF is actually selected
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(
        `This PDF has ${pdf.numPages} pages — only PDFs with ${MAX_PDF_PAGES} or fewer pages are supported.`
      );
    }

    const pageImages: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      // Scale 2.0 gives a higher resolution render that improves OCR accuracy
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // pdfjs-dist v5 takes `canvas` directly; `canvasContext` is deprecated
      await page.render({ canvas, viewport }).promise;

      // Export as PNG data URL — the existing OCR pipeline accepts base64 data URLs
      pageImages.push(canvas.toDataURL('image/png'));
    }

    return pageImages;
  };

  const readPreviewsAndEnqueue = async (files: File[]) => {
    const newItems: ImageQueueItem[] = [];

    for (const file of files) {
      if (file.type === 'application/pdf') {
        // Convert each PDF page into a PNG data URL and enqueue them as separate items
        try {
          const pageDataUrls = await pdfToImages(file);
          for (let i = 0; i < pageDataUrls.length; i++) {
            const dataUrl = pageDataUrls[i];
            // Wrap the PNG data back into a File object so the rest of the
            // pipeline (which expects a File) works without modification
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const pageFile = new File([blob], `${file.name}-page${i + 1}.png`, { type: 'image/png' });
            newItems.push({
              id: `${file.name}-p${i + 1}-${Date.now()}-${Math.random()}`,
              file: pageFile,
              preview: dataUrl,
              status: 'pending' as QueueStatus,
              data: null,
              statusMsg: `PDF page ${i + 1} of ${pageDataUrls.length} — ready to extract`,
              errorMsg: '',
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not read PDF';
          alert(`Skipped "${file.name}": ${msg}`);
        }
      } else {
        // Regular image — existing flow
        const preview = await fileToBase64(file);
        newItems.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          preview,
          status: 'pending' as QueueStatus,
          data: null,
          statusMsg: 'Ready to extract',
          errorMsg: '',
        });
      }
    }

    setImageQueue((prev) => [...prev, ...newItems]);
  };

  const removeFromQueue = (id: string) => {
    setImageQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const resetAll = () => {
    setImageQueue([]);
    setBatchInfo(null);
  };

  // ─── Tag detection ────────────────────────────────────────────────────────

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

  // ─── Pipeline result normaliser ───────────────────────────────────────────

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
      visibleColumns.forEach((col) => { filteredRow[col] = row[col] ?? ''; });
      return filteredRow;
    });

    const languageName = classification.languageName ?? '';
    const languageCode = classification.languageCode ?? '';
    const detectedLanguages = languageName ? [languageName] : [];
    const rawText = JSON.stringify(result, null, 2);
    const autoTags = detectTags(rawText, visibleColumns);

    // ── Confidence calculation ─────────────────────────────────────────────
    // We compute this from the data itself — no extra API call needed.
    //
    // fillScore: what percentage of cells in the final table actually have a
    // non-empty value. A fully-filled table = 100, half-empty = 50, etc.
    //
    // warningPenalty: each validation warning the AI flagged costs 8 points,
    // since a warning means at least one row has a suspicious value.
    //
    // The result is clamped between 30 (something was extracted) and 98
    // (nothing is ever truly perfect).
    const totalCells = visibleRows.length * visibleColumns.length;
    const filledCells = visibleRows.reduce((count, row) => {
      return count + visibleColumns.filter((col) => row[col]?.trim() !== '').length;
    }, 0);
    const fillScore = totalCells > 0 ? (filledCells / totalCells) * 100 : 50;
    const warningCount = Array.isArray(validation.warnings) ? validation.warnings.length : 0;
    const warningPenalty = warningCount * 8;
    const confidence = Math.round(Math.min(98, Math.max(30, fillScore - warningPenalty)));

    return {
      tableData: visibleRows,
      columnNames: visibleColumns,
      autoTags,
      confidence,
      rawText,
      datasetType: classification.datasetType ?? 'general',
      languageName,
      languageCode,
      detectedLanguages,
      // The AI sometimes returns warning objects like { row, message } instead of
      // plain strings. Coerce everything to a string here so the render never
      // tries to put a raw object inside a <li> and crash React.
      validationWarnings: Array.isArray(validation.warnings)
        ? validation.warnings.map((w: unknown) => {
            if (typeof w === 'string') return w;
            if (typeof w === 'object' && w !== null && 'message' in w) return String((w as Record<string, unknown>).message);
            return JSON.stringify(w);
          })
        : [],
      addedColumns,
    };
  };

  // ─── Edge function call ───────────────────────────────────────────────────

  const callPipeline = async (imageBase64: string, mode: 'fast' | 'full') => {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-extract`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ imageBase64, mode }),
      }
    );
    const responseText = await response.text();
    if (!response.ok) throw new Error(`OCR failed (${response.status}): ${responseText}`);
    return JSON.parse(responseText);
  };

  // ─── Queue item updater ───────────────────────────────────────────────────

  // Updates one item in the queue by ID without touching the others.
  // We always use the functional form of setState (prev => ...) here so that
  // parallel updates from Promise.all don't overwrite each other — each update
  // receives the latest state rather than a stale snapshot.
  const updateItem = (
    id: string,
    patch: Partial<Omit<ImageQueueItem, 'id' | 'file' | 'preview'>>
  ) => {
    setImageQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  // ─── Parallel batch processor ─────────────────────────────────────────────

  // This is the core of the parallel processing. Here's the strategy:
  //
  // 1. Split all pending images into batches of BATCH_SIZE (4).
  // 2. For each batch, run ALL fast passes in parallel using Promise.all.
  //    Fast pass = the quick first extraction. Results appear simultaneously.
  // 3. After all fast passes in the batch complete, run ALL full passes
  //    (enrichment) for the language tables in parallel using Promise.all.
  // 4. Move to the next batch.
  //
  // Why two stages (fast then full) within each batch?
  // Because we want the user to see all 4 quick results appear at once,
  // then see the enriched versions appear together — rather than waiting for
  // one full pipeline before starting the next image.

  const processAll = async () => {
    if (!user) return;
    setIsProcessing(true);

    const pendingItems = imageQueue.filter((item) => item.status === 'pending');
    const totalBatches = Math.ceil(pendingItems.length / BATCH_SIZE);

    // Wrap everything in try/finally so isProcessing and batchInfo are ALWAYS
    // reset — even if something unexpected throws inside the loop.
    try {
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        // Slice out the current batch from the pending list
        const batch = pendingItems.slice(
          batchIndex * BATCH_SIZE,
          (batchIndex + 1) * BATCH_SIZE
        );

        // Tell the UI which batch we're on
        setBatchInfo({ current: batchIndex + 1, total: totalBatches });

        // Mark every image in this batch as "processing" before we start
        batch.forEach((item) => {
          updateItem(item.id, { status: 'processing', statusMsg: 'Extracting...' });
        });

        // ── Stage 1: Fast pass for all images in this batch, in parallel ────
        // Promise.all fires all requests at the same time and waits for all
        // to finish. Each image's quick result appears as soon as it resolves.
        const fastResults: FastPassResult[] = await Promise.all(
          batch.map(async (item): Promise<FastPassResult> => {
            try {
              const imageBase64 = await fileToBase64(item.file);
              const fastResult = await callPipeline(imageBase64, 'fast');
              const fastData = buildExtractedDataFromResult(fastResult);

              // Show the fast result right away — don't wait for enrichment
              updateItem(item.id, { data: fastData });

              return { item, imageBase64, fastData, success: true };
            } catch (err) {
              updateItem(item.id, {
                status: 'error',
                statusMsg: 'Extraction failed',
                errorMsg: err instanceof Error ? err.message : 'Unknown error',
              });
              return { item, imageBase64: '', fastData: null, success: false };
            }
          })
        );

        // Mark non-language images as done — they don't need enrichment
        fastResults
          .filter((r) => r.success && r.fastData?.datasetType !== 'language')
          .forEach(({ item }) => {
            updateItem(item.id, { status: 'done', statusMsg: 'Table extracted successfully' });
          });

        // ── Stage 2: Full pass for language tables — one at a time ──────────
        // We intentionally process enrichments sequentially here, not in parallel.
        // Running all 4 full pipelines simultaneously (28 OpenAI calls at once)
        // can overwhelm Supabase's edge function concurrency and cause timeouts.
        // Sequential enrichment is slower but stable — the user already has the
        // fast result to look at while each image enriches in turn.
        const languageResults = fastResults.filter(
          (r) => r.success && r.fastData?.datasetType === 'language'
        );

        for (const { item, imageBase64, fastData } of languageResults) {
          const langName = fastData?.languageName || 'detected language';
          updateItem(item.id, { statusMsg: `Enriching ${langName} table...` });

          try {
            const fullResult = await callPipeline(imageBase64, 'full');
            const fullData = buildExtractedDataFromResult(fullResult);

            // Only upgrade to the full result if it actually has usable data
            if (fullData.tableData.length > 0 && fullData.columnNames.length > 0) {
              updateItem(item.id, {
                data: fullData,
                status: 'done',
                statusMsg:
                  fullData.addedColumns && fullData.addedColumns.length > 0
                    ? `Enriched with ${fullData.addedColumns.join(', ')}`
                    : `Extracted (${fastData?.languageName || 'language'})`,
              });
            } else {
              // Full pass returned nothing useful — keep the fast result
              updateItem(item.id, {
                status: 'done',
                statusMsg: `Extracted (${fastData?.languageName || 'language'})`,
              });
            }
          } catch (_err) {
            // Enrichment failed but the user still has the fast result — keep it
            updateItem(item.id, {
              status: 'done',
              statusMsg: 'Shown fast result (enrichment failed)',
            });
          }
        }
      }
    } catch (err) {
      // Something unexpected escaped all the inner catches — log it but don't
      // leave the UI stuck in a "processing" state forever
      console.error('Unexpected error in processAll:', err);
    } finally {
      // Always runs — even if the try block threw
      setBatchInfo(null);
      setIsProcessing(false);
    }
  };

  // ─── Save a single table ──────────────────────────────────────────────────

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
    if (error) { console.error('Supabase insert error:', error); return false; }
    return true;
  };

  const saveAll = async () => {
    if (!user) return;

    // Check limits before doing any work — show the upgrade modal and stop early
    if (!canUpload) { setUpgradeModal('uploads'); return; }
    if (!canStore)  { setUpgradeModal('storage'); return; }

    const readyItems = imageQueue.filter(
      (item) => item.status === 'done' && item.data && item.data.tableData.length > 0
    );
    if (readyItems.length === 0) return;

    setIsProcessing(true);
    let savedCount = 0;

    for (const item of readyItems) {
      // Re-check the storage limit for each table — the user may have queued
      // more tables than their remaining capacity allows
      if (!canStore) { setUpgradeModal('storage'); break; }
      if (!canUpload) { setUpgradeModal('uploads'); break; }

      const success = await saveSingleTable(item.data!);
      if (success) {
        savedCount++;
        // Keep the local usage counters in sync without waiting for a refetch
        incrementUploadCount();
      }
    }

    setIsProcessing(false);

    if (savedCount > 0) {
      // Sync the real counts from the DB so the warning banners are accurate
      await refetch();
      resetAll();
      onSaved?.();
    } else if (upgradeModal === null) {
      // Only show the generic failure alert if we didn't already show a limit modal
      alert('Failed to save tables. Please try again.');
    }
  };

  // ─── File input handler ───────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    // Accept images and PDFs; skip anything else
    const validFiles = selectedFiles.filter(
      (f) => f.type.startsWith('image/') || f.type === 'application/pdf'
    );

    if (validFiles.length < selectedFiles.length) {
      alert('Some files were skipped — only image files and PDFs are accepted.');
    }

    // Work out how many slots are left before we hit the cap.
    // PDFs may expand into multiple pages, but we don't know the page count yet —
    // the cap will be enforced again inside readPreviewsAndEnqueue if needed.
    const currentCount = imageQueue.length;
    const remainingSlots = MAX_IMAGES - currentCount;

    if (remainingSlots <= 0) {
      alert(`You've reached the maximum of ${MAX_IMAGES} items per session.`);
      e.target.value = '';
      return;
    }

    // Trim to the number of files that might fit (exact enforcement happens after PDF expansion)
    const filesToAdd = validFiles.slice(0, remainingSlots);

    if (validFiles.length > remainingSlots) {
      alert(
        `Only ${remainingSlots} more file${remainingSlots !== 1 ? 's' : ''} can be added ` +
        `(max ${MAX_IMAGES} total). The first ${remainingSlots} were selected.`
      );
    }

    if (filesToAdd.length === 0) { e.target.value = ''; return; }

    readPreviewsAndEnqueue(filesToAdd);
    // Reset the input so the same file can be selected again if needed
    e.target.value = '';
  };

  // ─── Derived state ────────────────────────────────────────────────────────

  const pendingCount = imageQueue.filter((i) => i.status === 'pending').length;
  const doneCount = imageQueue.filter((i) => i.status === 'done').length;
  const readyToSave = imageQueue.filter(
    (i) => i.status === 'done' && i.data && i.data.tableData.length > 0
  ).length;
  const remainingSlots = MAX_IMAGES - imageQueue.length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2 dark:text-white">
              Upload Table Images
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Select up to {MAX_IMAGES} images — processed {BATCH_SIZE} at a time in parallel
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label="Close upload modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 mb-6">

          {/* Status bar */}
          <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 dark:bg-zinc-950 dark:border-zinc-800 dark:text-gray-200 flex flex-wrap items-center gap-3">
            <span>
              Mode: <span className="font-semibold">Fast + Enrichment — {BATCH_SIZE} images in parallel</span>
            </span>
            {imageQueue.length > 0 && (
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                {imageQueue.length}/{MAX_IMAGES} images selected
                {doneCount > 0 && ` · ${doneCount} extracted`}
              </span>
            )}
            {/* Remaining slots badge */}
            {imageQueue.length > 0 && remainingSlots > 0 && (
              <span className="text-gray-400 dark:text-gray-500">
                ({remainingSlots} slot{remainingSlots !== 1 ? 's' : ''} left)
              </span>
            )}
          </div>

          {/* Clickable drop zone — hidden when at cap */}
          {remainingSlots > 0 ? (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer dark:border-gray-700 dark:hover:border-blue-500">
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                disabled={isProcessing}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                  <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-600 mb-2 dark:text-gray-300">
                  Click to select images or PDFs{' '}
                  <span className="text-blue-600 font-medium dark:text-blue-400">
                    (up to {remainingSlots} more)
                  </span>
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  PNG, JPG, WEBP up to 10MB · PDF up to 10 pages
                </p>
              </label>
            </div>
          ) : (
            // Show a "cap reached" notice instead of the drop zone
            <div className="border-2 border-dashed border-amber-300 rounded-xl p-6 text-center bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700">
              <p className="text-amber-700 dark:text-amber-400 font-medium">
                Maximum of {MAX_IMAGES} images reached
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
                Extract and save these, then you can add more
              </p>
            </div>
          )}

          {/* Batch progress indicator — appears while processing */}
          {batchInfo && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/10 dark:border-blue-800">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  Batch {batchInfo.current} of {batchInfo.total}
                </p>
                <p className="text-xs text-blue-500 dark:text-blue-400">
                  Processing up to {BATCH_SIZE} images in parallel
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {imageQueue.length > 0 && (
            <div className="mt-4 flex gap-3 flex-wrap">
              {pendingCount > 0 && (
                <button
                  onClick={processAll}
                  disabled={isProcessing}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                  ) : (
                    <><Upload className="w-5 h-5" /> Extract {pendingCount} Image{pendingCount !== 1 ? 's' : ''}</>
                  )}
                </button>
              )}

              {readyToSave > 0 && (
                <button
                  onClick={saveAll}
                  disabled={isProcessing}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Saving...' : `Save ${readyToSave} Table${readyToSave !== 1 ? 's' : ''}`}
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

        {/* Results — one card per image */}
        {imageQueue.length > 0 && (
          <div className="space-y-6">
            {imageQueue.map((item, index) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-lg border border-gray-200 dark:bg-zinc-900 dark:border-zinc-800 overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-center gap-4 p-4 border-b border-gray-100 dark:border-zinc-800">
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

                {/* Error message */}
                {item.status === 'error' && item.errorMsg && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-900/30">
                    <p className="text-sm text-red-700 dark:text-red-400">{item.errorMsg}</p>
                  </div>
                )}

                {/* Extracted data */}
                {item.data && (
                  <div className="p-6">
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
                      {item.data.autoTags.map((tag) => (
                        <span key={tag} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm dark:bg-blue-900/30 dark:text-blue-300">
                          {tag}
                        </span>
                      ))}
                    </div>

                    {item.data.validationWarnings && item.data.validationWarnings.length > 0 && (
                      <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/40 dark:bg-yellow-900/10">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">Warnings</p>
                        <ul className="text-sm text-yellow-700 dark:text-yellow-200 space-y-1">
                          {item.data.validationWarnings.map((w, i) => (
                            <li key={i}>• {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-sm bg-white dark:bg-zinc-900">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            {item.data.columnNames.map((col) => {
                              const isAi = (item.data!.addedColumns ?? []).includes(col);
                              return (
                                <th key={col} className={`text-left p-2 font-semibold ${isAi ? '' : 'text-gray-900 dark:text-white'}`}>
                                  <AiColumnHeader name={col} isAi={isAi} />
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {item.data.tableData.length > 0 ? (
                            item.data.tableData.map((row, rowIdx) => (
                              <tr key={rowIdx} className="border-b border-gray-100 dark:border-zinc-800">
                                {item.data!.columnNames.map((col) => (
                                  <td key={col} className="p-2 text-gray-900 dark:text-gray-100">
                                    {row[col] ?? ''}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="p-2 text-gray-500 dark:text-gray-400" colSpan={item.data.columnNames.length}>
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

        {/* Bottom save button */}
        {readyToSave > 0 && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={saveAll}
              disabled={isProcessing}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Saving...' : `Save All ${readyToSave} Table${readyToSave !== 1 ? 's' : ''} to My Tables`}
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

      {/* Upgrade modals — shown when a save hits the monthly upload or storage cap */}
      <UpgradeModal
        isOpen={upgradeModal === 'uploads'}
        onClose={() => setUpgradeModal(null)}
        limitType="uploads"
        current={uploadsThisMonth}
      />
      <UpgradeModal
        isOpen={upgradeModal === 'storage'}
        onClose={() => setUpgradeModal(null)}
        limitType="storage"
        current={totalTables}
      />
    </div>
  );
}
