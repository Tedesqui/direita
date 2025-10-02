import OpenAI from 'openai';
import Parser from 'rss-parser';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const parser = new Parser();

// --- LISTA DE FONTES DE NOTÍCIAS (FEEDS RSS) ATUALIZADA ---
// Fontes de direita nacionais e internacionais.
const RSS_FEEDS = [
    'https://www.gazetadopovo.com.br/feed/rss/',       // Gazeta do Povo (Brasil)
    'https://revistaoeste.com/feed/',                  // Revista Oeste (Brasil)
    'https://www.jornaldacidadeonline.com.br/feed.xml',// Jornal da Cidade Online (Brasil)
    'https://pleno.news/feed/',                        // Pleno.News (Brasil)
    'https://www.brasilsemmedo.com/feed/',             // Brasil Sem Medo (Brasil)
    'http://feeds.foxnews.com/foxnews/politics',       // Fox News - Politics (Internacional)
];

export default async function handler(request, response) {
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const articles = [];
        // Busca os artigos de cada feed RSS
        for (const feedUrl of RSS_FEEDS) {
            try {
                const feed = await parser.parseURL(feedUrl);
                // Pega apenas o artigo mais recente de cada feed para garantir variedade
                // e manter o processamento rápido. Aumente para 2 se quiser mais volume.
                articles.push(...feed.items.slice(0, 1).map(item => ({
                    source: feed.title,
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
                    snippet: item.contentSnippet || item.content,
                })));
            } catch (error) {
                console.warn(`Falha ao buscar o feed: ${feedUrl}`);
            }
        }

        // Ordena todos os artigos por data de publicação, do mais novo para o mais antigo
        articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // Pega os 10 artigos mais recentes no total para processar com a IA
        const latestArticles = articles.slice(0, 10);

        // Processa cada artigo com a OpenAI
        const processedArticles = await Promise.all(
            latestArticles.map(async (article) => {
                const prompt = `
                Você é um jornalista analítico de um portal de notícias de direita. Sua tarefa é receber um artigo de uma fonte externa e criar uma nova matéria a partir dele, adicionando valor e uma perspectiva única. NÃO copie frases do original.

                Fonte Original:
                - Título: "${article.title}"
                - Trecho: "${article.snippet}"

                Sua tarefa é gerar um objeto JSON com a seguinte estrutura:
                - "novo_titulo": Crie um título original, impactante e otimizado para SEO para a sua nova matéria.
                - "paragrafo_principal": Escreva um parágrafo de abertura (lead) original, com 2-3 frases, que apresente os fatos mais importantes da notícia de forma direta.
                - "pontos_chave": Extraia de 3 a 4 fatos principais do artigo em formato de lista (array de strings). Foque apenas nos fatos (quem, o que, onde, quando).
                - "analise": Escreva um parágrafo de análise original (2-3 frases) explicando a importância desta notícia para o público de direita. Conecte o evento a princípios como liberdade econômica, valores conservadores, soberania nacional ou críticas a políticas progressistas. Este é o conteúdo de maior valor.

                Responda estritamente no formato JSON.
                `;

                try {
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o",
                        response_format: { type: "json_object" },
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.7,
                    });
                    
                    const aiData = JSON.parse(completion.choices[0].message.content);
                    
                    // Combina os dados originais (link, fonte) com os novos dados gerados pela IA
                    return { ...article, aiContent: aiData };

                } catch (aiError) {
                    console.error(`Erro da OpenAI para o artigo: ${article.title}`);
                    return null; // Retorna nulo se a IA falhar para este artigo
                }
            })
        );
        
        // Filtra quaisquer artigos que possam ter falhado no processamento da IA
        const finalArticles = processedArticles.filter(article => article !== null);
        return response.status(200).json(finalArticles);

    } catch (error) {
        console.error('Erro geral na função da API:', error);
        return response.status(500).json({ error: 'Falha interna do servidor.' });
    }
}