import OpenAI from 'openai';
import Parser from 'rss-parser';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const parser = new Parser();

const RSS_FEEDS = [
    'https://www.gazetadopovo.com.br/feed/rss/',
    'https://revistaoeste.com/feed/',
    'https://www.jornaldacidadeonline.com.br/feed.xml',
    'https://pleno.news/feed/',
    'https://www.brasilsemmedo.com/feed/',
    'http://feeds.foxnews.com/foxnews/politics',
];

export default async function handler(request, response) {
    // ... (O código inicial que busca os feeds RSS permanece o mesmo) ...

    try {
        const articles = [];
        for (const feedUrl of RSS_FEEDS) {
            try {
                const feed = await parser.parseURL(feedUrl);
                articles.push(...feed.items.slice(0, 1).map(item => ({
                    source: feed.title,
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
                    snippet: item.contentSnippet || item.content,
                })));
            } catch (error) { console.warn(`Falha ao buscar o feed: ${feedUrl}`); }
        }
        articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        const latestArticles = articles.slice(0, 10);

        const processedArticles = await Promise.all(
            latestArticles.map(async (article) => {
                // --- PROMPT ATUALIZADO PARA TOM MAIS AGRESSIVO E OPINATIVO ---
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
                        temperature: 0.75, // Aumenta um pouco a "criatividade" para um tom mais forte
                    });
                    
                    const aiData = JSON.parse(completion.choices[0].message.content);
                    return { ...article, aiContent: aiData };

                } catch (aiError) {
                    console.error(`Erro da OpenAI para o artigo: ${article.title}`);
                    return null;
                }
            })
        );
        
        const finalArticles = processedArticles.filter(article => article !== null);
        return response.status(200).json(finalArticles);

    } catch (error) {
        console.error('Erro geral na função da API:', error);
        return response.status(500).json({ error: 'Falha interna do servidor.' });
    }
}
