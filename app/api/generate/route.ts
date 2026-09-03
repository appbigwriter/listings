import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'A chave OPENAI_API_KEY não está configurada no servidor.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { promptData } = body;

    const systemPrompt = `Você é um especialista em SEO e copywriter focado em e-commerce, especificamente para a Amazon US.
Sua tarefa é criar ou reescrever dados de cadastro de produto (listing) garantindo que sejam originais, altamente otimizados para busca (SEO) e focados em conversão.

Regras rígidas:
- Retorne APENAS um objeto JSON válido, sem formatação markdown em volta, sem texto extra.
- O JSON deve ter a seguinte estrutura:
  {
    "title": "Título otimizado",
    "bullets": "Bullet 1\\nBullet 2\\nBullet 3\\nBullet 4\\nBullet 5",
    "description": "<p>Descrição detalhada usando HTML básico.</p>",
    "keywords": "palavra1 palavra2 palavra3..."
  }
- O título (title) deve ser claro, factual, entre 100 e 150 caracteres, e começar preferencialmente com a Marca e o Tipo de Produto.
- Os "bullets" devem conter exatamente 5 tópicos (uma quebra de linha entre cada), cada um com menos de 200 caracteres, destacando benefícios principais, facilidade de uso, durabilidade/material e o que inclui.
- A "description" deve ser rica em detalhes, usar tags HTML permitidas na Amazon (<b>, <br>, <p>, <ul>, <li>) e detalhar mais as qualidades e uso do produto.
- As "keywords" (generic_keywords) devem ser termos de busca separados por espaço (não use vírgulas), omitindo palavras que já estão no título, máximo 240 bytes.
- Se o usuário forneceu dados base, reescreva-os para melhorar a qualidade comercial. Se ele forneceu apenas dicas, crie do zero de forma criativa e realista para o nicho de sinalização comercial/industrial.
- Evite exageros, promessas infundadas ou palavras proibidas na Amazon (ex: "best seller", "free shipping", "guaranteed").
- A marca é "FBRSigns", sempre que apropriado.`;

    const userMessage = `Por favor, crie/reescreva o listing com base nas seguintes informações fornecidas pelo usuário:
${JSON.stringify(promptData, null, 2)}
Lembre-se: Retorne apenas o JSON.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use gpt-4o-mini for speed and lower cost
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const result = completion.choices[0].message.content;
    
    if (!result) {
      throw new Error("Nenhum conteúdo retornado pela IA.");
    }
    
    const parsedResult = JSON.parse(result);

    return NextResponse.json(parsedResult);
  } catch (error: any) {
    console.error('Erro na API de geração IA:', error);
    return NextResponse.json(
      { error: 'Falha ao processar a geração via IA', details: error.message },
      { status: 500 }
    );
  }
}
