import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Chave OPENAI_API_KEY não configurada.' }, { status: 500 });
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { fieldId, formState } = await req.json();

    let systemPrompt = '';
    
    // Regras de negócio por campo
    switch (fieldId) {
      case 'sku':
        systemPrompt = `Você é um gerador de SKUs para a empresa FBRSigns.
Retorne APENAS um código string válido. Sem aspas.
Regra: FBR-[INICIAIS DA CATEGORIA, MAX 4 LETRAS]-[4 NUMEROS ALEATORIOS].
Exemplo se categoria for Signage: FBR-SIGN-9281.
Se não souber a categoria, use SGN.`;
        break;
        
      case 'price':
        systemPrompt = `Você é um precificador para e-commerce (Amazon US).
Retorne APENAS o valor numérico em USD (ex: 29.99). Sem cifrão.
Baseie-se nas dimensões, material e tipo de placa fornecidos no contexto. Placas pequenas variam de 12 a 25 USD. Placas grandes ou metálicas 25 a 50 USD.`;
        break;
        
      case 'product_type':
        systemPrompt = `Você é especialista no Amazon Seller Central.
Retorne APENAS o nome do Product Type exato sugerido para a Amazon. (Ex: SIGNAGE, HARDWARE_HANDLE, OFFICE_PRODUCTS).
Baseie-se no título e descrição fornecidos.`;
        break;
        
      case 'title':
        systemPrompt = `Você é um copywriter SEO para Amazon US.
Retorne APENAS o texto do título gerado, sem aspas. Entre 100 e 150 caracteres.
Comece com a marca FBRSigns. Maximize palavras-chave.`;
        break;
        
      case 'bullets':
        systemPrompt = `Você é um copywriter SEO para Amazon US.
Retorne APENAS o texto com 5 bullet points, separados por quebra de linha (\\n), sem marcadores como -, * ou números. Maximize persuasão e informações técnicas baseadas no contexto.`;
        break;
        
      case 'description':
        systemPrompt = `Você é um copywriter SEO para Amazon US.
Retorne APENAS o código HTML básico (<p>, <b>, <ul>, <li>) para a product_description. Mantenha profissional e focado no nicho de sinalização comercial.`;
        break;
        
      case 'keywords':
        systemPrompt = `Você é um especialista em SEO para Amazon US.
Retorne APENAS palavras-chave genéricas, separadas por ESPAÇO. Sem vírgulas. Max 240 bytes. Não repita palavras que já estão no título.`;
        break;
        
      case 'brand':
      case 'manufacturer':
        return NextResponse.json({ value: 'FBRSigns' });
        
      case 'origin':
        return NextResponse.json({ value: 'United States' });
        
      default:
        systemPrompt = `Extraia ou gere um valor plausível em inglês para o campo '${fieldId}' do e-commerce da Amazon.
Retorne APENAS o valor (string ou número). Sem explicação extra.`;
        break;
    }

    const userMessage = `Contexto atual do formulário:
${JSON.stringify(formState, null, 2)}

Por favor, gere ou infira o valor APENAS para o campo '${fieldId}'. Se você puder deduzir a partir dos dados, ótimo, senão, invente algo plausível com base no contexto.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
    });

    const result = completion.choices[0].message.content?.trim() || '';
    
    // Remove aspas se a IA teimosamente devolver
    const finalResult = result.replace(/^["']|["']$/g, '');
    
    return NextResponse.json({ value: finalResult });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
