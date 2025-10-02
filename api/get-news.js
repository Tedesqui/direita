import { kv } from '@vercel/kv';

export default async function handler(request, response) {
    try {
        // Busca os dados que foram salvos pelo nosso robô usando a chave 'latest_news'
        const articles = await kv.get('latest_news');

        if (!articles) {
            // Se não houver nada no banco de dados ainda, retorna uma lista vazia.
            return response.status(200).json([]);
        }

        // Retorna os artigos do banco de dados. É instantâneo e não gasta tokens!
        return response.status(200).json(articles);

    } catch (error) {
        console.error('Erro ao buscar notícias do KV:', error);
        return response.status(500).json({ error: 'Falha ao carregar notícias.' });
    }
}