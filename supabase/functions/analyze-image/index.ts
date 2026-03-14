// Follow this setup guide to integrate the Deno runtime into your application:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

declare const Deno: {
  env: { get: (key: string) => string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as { imageBase64?: string }
    const imageBase64 = body && typeof body.imageBase64 === 'string' ? body.imageBase64 : ''
    
    if (!imageBase64) {
      throw new Error('Imagem não fornecida')
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('Chave de API do Gemini não configurada (GEMINI_API_KEY)')
    }

    const mimeTypeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg'

    // Clean base64 string
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, "")

    const prompt = `Analise esta imagem de plantio de cana-de-açúcar (ou amostra de solo/mudas).
    Objetivo: Contar as gemas (buds) visíveis e os toletes (setts).
    1. Conte o total de gemas e tente classificar como 'boas' (viáveis) ou 'ruins' (danificadas/secas).
    2. Conte o total de toletes e classifique como 'bons' ou 'ruins'.
    
    Se a imagem não for clara ou não contiver esses elementos, retorne zeros.
    
    Retorne APENAS um JSON válido com a seguinte estrutura (sem markdown, sem explicações):
    {
        "gemas": { "total": 0, "boas": 0, "ruins": 0 },
        "toletes": { "total": 0, "bons": 0, "ruins": 0 }
    }`

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        }],
        generationConfig: { response_mime_type: 'application/json' },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      throw new Error(errText || `Erro Gemini HTTP ${geminiRes.status}`)
    }

    const geminiData = await geminiRes.json()
    const parts = geminiData?.candidates?.[0]?.content?.parts
    const rawText = Array.isArray(parts) ? parts.map((p: any) => p?.text || '').join('\n') : ''
    const text = String(rawText || '').replace(/```json/gi, '```').replace(/```/g, '').trim()
    
    // Extract JSON from text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    let data: unknown
    if (jsonMatch) {
      data = JSON.parse(jsonMatch[0])
    } else {
       throw new Error('Falha ao processar resposta da IA')
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
