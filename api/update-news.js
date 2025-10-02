import { kv } from '@vercel/kv';
import OpenAI from 'openai';
import Parser from 'rss-parser';

// Inicializa os clientes da OpenAI e do Parser de RSS
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
const parser = new Parser();

// Lista de fontes de notícias (Feeds RSS)
const RSS_FEEDS = [
    'https://www.gazetadopovo.com.br/feed/rss/',       // Gazeta do Povo (Brasil)
    'https://revistaoeste.com/feed/',                  // Revista Oeste (Brasil)
    'https://www.jornaldacidadeonline.com.br/feed.xml',// Jornal da Cidade Online (Brasil)
    'https://pleno.news/feed/',                        // Pleno.News (Brasil)
    'https://www.brasilsemmedo.com/feed/',             // Brasil Sem Medo (Brasil)
    'http://feeds.foxnews.com/foxnews/politics',       // Fox News - Politics (Internacional)
];

// Esta função é o nosso "Robô", projetado para ser chamado por um Cron Job.
export default async function handler(request, response) {
    try {
        const articles = [];
        // 1. Busca os artigos mais recentes de cada feed RSS
        for (const feedUrl of RSS_FEEDS) {
            try {
                const feed = await parser.parseURL(feedUrl);
                // Pega o artigo mais recente de cada fonte para garantir variedade
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

        // Ordena todos os artigos coletados por data de publicação
        articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        
        // Limita a um total de 10 artigos para processar por vez
        const latestArticles = articles.slice(0, 10);

        // 2. Processa cada artigo com a OpenAI para criar o conteúdo transformador
        const processedArticles = await Promise.all(
            latestArticles.map(async (article) => {
                const prompt = `
                Você é um jornalista analítico e editor-chefe de um portal de notícias de direita influente. Seu estilo é direto, incisivo e não tem medo de expor as falhas de políticas progressistas. Sua tarefa é criar uma nova matéria a partir do artigo de uma fonte externa.

                Fonte Original:
                - Título: "${article.title}"
                - Trecho: "${article.snippet}"

                Sua tarefa é gerar um objeto JSON com a seguinte estrutura:
                - "novo_titulo": Crie um título original e forte, que seja provocativo e deixe clara a perspectiva de direita.
                - "paragrafo_principal": Escreva um parágrafo de abertura (lead) com 3-4 frases. Use uma linguagem enérgica para apresentar os fatos e já sinalizar o viés da sua análise.
                - "pontos_chave": Extraia de 3 a 4 fatos principais do artigo. Apresente-os de forma direta e sem rodeios.
                - "analise": Escreva um parágrafo de análise contundente (3-4 frases). Deixe a perspectiva de direita explícita e seja agressivo na crítica. Conecte o evento a falhas da esquerda, ameaças à liberdade econômica, ataques a valores tradicionais ou à soberania nacional. Use uma linguagem que mobilize o leitor.

                Responda estritamente no formato JSON.
                `;

                try {
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o",
                        response_format: { type: "json_object" },
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.75,
                    });
                    
                    const aiData = JSON.parse(completion.choices[0].message.content);
                    
                    return { ...article, aiContent: aiData };

                } catch (aiError) {
                    console.error(`Erro da OpenAI para o artigo: ${article.title}`, aiError);
                    return null;
                }
            })
        );
        
        const finalArticles = processedArticles.filter(article => article !== null);

        // 3. Salva a lista final de artigos processados no banco de dados Vercel KV
        // A chave 'latest_news' será usada pelo nosso outro API para ler os dados.
        await kv.set('latest_news', finalArticles);

        console.log(`Notícias atualizadas com sucesso no banco de dados! ${finalArticles.length} artigos salvos.`);
        
        // 4. Retorna uma resposta de sucesso para o log do Cron Job
        return response.status(200).json({ status: 'success', articles_updated: finalArticles.length });

    } catch (error) {
        console.error('Erro no Cron Job de atualização de notícias:', error);
        return response.status(500).json({ status: 'error', message: error.message });
    }
}