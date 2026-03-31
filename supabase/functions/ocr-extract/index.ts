import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type OCRSpaceResponse = {
  OCRExitCode?: number
  IsErroredOnProcessing?: boolean
  ErrorMessage?: string[] | string
  ParsedResults?: Array<{
    ParsedText?: string
    TextOverlay?: {
      HasOverlay?: boolean
      Lines?: Array<{
        LineText?: string
        Words?: Array<{
          WordText?: string
          Left?: number
          Top?: number
          Height?: number
          Width?: number
        }>
      }>
    }
  }>
}

type PreparedWord = {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  centerX: number
  centerY: number
}

function groupWordsIntoRows(words: PreparedWord[], yTolerance = 18): PreparedWord[][] {
  const sorted = [...words].sort((a, b) => {
    const yDiff = a.centerY - b.centerY
    if (Math.abs(yDiff) > 1) return yDiff
    return a.x0 - b.x0
  })

  const rows: PreparedWord[][] = []

  for (const word of sorted) {
    let bestRowIndex = -1
    let bestDistance = Infinity

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const avgY = row.reduce((sum, item) => sum + item.centerY, 0) / row.length
      const distance = Math.abs(avgY - word.centerY)

      if (distance <= yTolerance && distance < bestDistance) {
        bestDistance = distance
        bestRowIndex = i
      }
    }

    if (bestRowIndex >= 0) {
      rows[bestRowIndex].push(word)
    } else {
      rows.push([word])
    }
  }

  return rows
    .map((row) => [...row].sort((a, b) => a.x0 - b.x0))
    .sort((a, b) => {
      const avgA = a.reduce((sum, item) => sum + item.centerY, 0) / a.length
      const avgB = b.reduce((sum, item) => sum + item.centerY, 0) / b.length
      return avgA - avgB
    })
}

function inferColumnAnchors(rows: PreparedWord[][], xTolerance = 45): number[] {
  const anchors: number[] = []

  for (const row of rows) {
    for (const word of row) {
      const existingIndex = anchors.findIndex(
        (anchor) => Math.abs(anchor - word.x0) <= xTolerance
      )

      if (existingIndex >= 0) {
        anchors[existingIndex] = Math.round((anchors[existingIndex] + word.x0) / 2)
      } else {
        anchors.push(word.x0)
      }
    }
  }

  return anchors.sort((a, b) => a - b)
}

function assignWordsToColumns(rows: PreparedWord[][], anchors: number[]) {
  if (anchors.length === 0) {
    return {
      tableData: [] as Record<string, string>[],
      columnNames: ['Text'],
    }
  }

  const columnNames = anchors.map((_, index) => `Column ${index + 1}`)

  const tableData = rows.map((row) => {
    const cells = Array.from({ length: anchors.length }, () => '')

    for (const word of row) {
      let bestIndex = 0
      let bestDistance = Math.abs(word.x0 - anchors[0])

      for (let i = 1; i < anchors.length; i++) {
        const distance = Math.abs(word.x0 - anchors[i])
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = i
        }
      }

      cells[bestIndex] = cells[bestIndex]
        ? `${cells[bestIndex]} ${word.text}`
        : word.text
    }

    const rowObject: Record<string, string> = {}
    columnNames.forEach((col, idx) => {
      rowObject[col] = cells[idx] ?? ''
    })

    return rowObject
  })

  return { tableData, columnNames }
}

function fallbackTextToTable(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      tableData: [] as Record<string, string>[],
      columnNames: ['Text'],
    }
  }

  return {
    tableData: lines.map((line) => ({ Text: line })),
    columnNames: ['Text'],
  }
}

function compressSparseColumns(
  tableData: Record<string, string>[],
  columnNames: string[],
  minFillRatio = 0.12
) {
  if (tableData.length === 0 || columnNames.length === 0) {
    return { tableData, columnNames }
  }

  const keepColumns = columnNames.filter((col) => {
    const filled = tableData.filter((row) => (row[col] ?? '').trim().length > 0).length
    return filled / tableData.length >= minFillRatio
  })

  if (keepColumns.length === 0) {
    return {
      tableData: tableData.map((row) => ({
        Text: Object.values(row).filter(Boolean).join(' ').trim(),
      })),
      columnNames: ['Text'],
    }
  }

  const compacted = tableData.map((row) => {
    const nextRow: Record<string, string> = {}
    keepColumns.forEach((col) => {
      nextRow[col] = row[col] ?? ''
    })
    return nextRow
  })

  return {
    tableData: compacted,
    columnNames: keepColumns,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const apiKey = Deno.env.get('OCR_SPACE_API_KEY')

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing OCR_SPACE_API_KEY secret' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const upstreamForm = new FormData()
    upstreamForm.append('file', file, file.name)
    upstreamForm.append('apikey', apiKey)
    upstreamForm.append('language', 'auto')
    upstreamForm.append('isOverlayRequired', 'true')
    upstreamForm.append('OCREngine', '2')
    upstreamForm.append('scale', 'true')
    upstreamForm.append('detectOrientation', 'true')

    const upstreamRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: upstreamForm,
    })

    const data = (await upstreamRes.json()) as OCRSpaceResponse

    if (!upstreamRes.ok || data.IsErroredOnProcessing) {
      const errorMessage = Array.isArray(data.ErrorMessage)
        ? data.ErrorMessage.join(', ')
        : data.ErrorMessage || 'OCR processing failed'

      return new Response(
        JSON.stringify({
          error: errorMessage,
          upstreamStatus: upstreamRes.status,
          raw: data,
        }),
        {
          status: upstreamRes.status || 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const parsedResults = data.ParsedResults ?? []
    const rawText = parsedResults
      .map((item) => item.ParsedText ?? '')
      .join('\n')
      .trim()

    const preparedWords: PreparedWord[] = []

    for (const result of parsedResults) {
      const lines = result.TextOverlay?.Lines ?? []
      for (const line of lines) {
        const words = line.Words ?? []
        for (const word of words) {
          const text = (word.WordText ?? '').trim()
          if (!text) continue

          const x0 = word.Left ?? 0
          const y0 = word.Top ?? 0
          const width = word.Width ?? 0
          const height = word.Height ?? 0
          const x1 = x0 + width
          const y1 = y0 + height

          preparedWords.push({
            text,
            x0,
            y0,
            x1,
            y1,
            centerX: (x0 + x1) / 2,
            centerY: (y0 + y1) / 2,
          })
        }
      }
    }

    let tableData: Record<string, string>[] = []
    let columnNames: string[] = ['Text']

    if (preparedWords.length > 0) {
      const rows = groupWordsIntoRows(preparedWords, 18)
      const anchors = inferColumnAnchors(rows, 45)
      const parsed = assignWordsToColumns(rows, anchors)

      if (parsed.tableData.length > 0) {
        const compacted = compressSparseColumns(parsed.tableData, parsed.columnNames)
        tableData = compacted.tableData
        columnNames = compacted.columnNames
      }
    }

    if (tableData.length === 0) {
      const fallback = fallbackTextToTable(rawText)
      tableData = fallback.tableData
      columnNames = fallback.columnNames
    }

    return new Response(
      JSON.stringify({
        rawText,
        confidence: 0,
        columnNames,
        tableData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})