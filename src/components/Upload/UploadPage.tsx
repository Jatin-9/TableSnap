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
    setOcrStatus('Uploading image for OCR...');

    try {
      const formData = new FormData();
      formData.append('file', file);

//trying to resolve the JWT auth issue in supabase

      const { data: sessionData } = await supabase.auth.getSession()
const accessToken = sessionData.session?.access_token

const headers: Record<string, string> = {
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
}

if (accessToken) {
  headers['Authorization'] = `Bearer ${accessToken}`
}

const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-extract`,
  {
    method: 'POST',
    headers,
    body: formData,
  }
);

      const responseText = await response.text();

      if (!response.ok) {
        console.error('OCR function failed:', response.status, responseText);
        alert(`OCR failed (${response.status}): ${responseText}`);
        setOcrStatus('OCR failed');
        return;
      }

      const result = JSON.parse(responseText);

      const columnNames = Array.isArray(result?.columnNames) ? result.columnNames : ['Text'];
      const tableData = Array.isArray(result?.tableData) ? result.tableData : [];
      const rawText = typeof result?.rawText === 'string' ? result.rawText : '';
      const confidence = typeof result?.confidence === 'number' ? result.confidence : 0;

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
              OCR languages: <span className="font-semibold">Auto-detect</span>
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
                    <p className="text-sm text-gray-400">PNG, JPG, WEBP up to 10MB</p>
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