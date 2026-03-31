import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('OCR_SPACE_API_KEY')
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return new Response(
        JSON.stringify({
          error: 'No file uploaded',
          debug: {
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey?.length ?? 0,
            fileExists: false,
          },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const upstreamForm = new FormData()
    upstreamForm.append('file', file, file.name)
    upstreamForm.append('apikey', apiKey ?? '')
    upstreamForm.append('language', 'auto')
    upstreamForm.append('isOverlayRequired', 'true')
    upstreamForm.append('OCREngine', '2')
    upstreamForm.append('scale', 'true')
    upstreamForm.append('detectOrientation', 'true')

    const upstreamRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: upstreamForm,
    })

    const upstreamBody = await upstreamRes.text()

    return new Response(
      JSON.stringify({
        debug: {
          hasApiKey: !!apiKey,
          apiKeyLength: apiKey?.length ?? 0,
          fileExists: true,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          upstreamStatus: upstreamRes.status,
          upstreamBody,
        },
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