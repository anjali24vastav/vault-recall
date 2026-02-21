// TF-IDF implementation for lightweight local semantic similarity

// Common English stopwords to filter out
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'it', 'its', 'this', 'that', 'are',
    'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just',
    'about', 'above', 'after', 'again', 'all', 'also', 'am', 'any', 'as',
    'because', 'before', 'between', 'both', 'each', 'few', 'get', 'got',
    'he', 'her', 'here', 'him', 'his', 'how', 'i', 'into', 'like', 'make',
    'me', 'more', 'most', 'my', 'new', 'now', 'only', 'other', 'our', 'out',
    'over', 'own', 'same', 'she', 'some', 'such', 'up', 'us', 'we', 'what',
    'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'you', 'your',
    'there', 'they', 'them', 'their', 'these', 'those', 'through', 'under',
    'until', 'well', 'much', 'many', 'still', 'even', 'back', 'down',
]);

/**
 * Tokenizes text into normalized terms: lowercase, remove punctuation,
 * filter stopwords, and apply basic stemming.
 */
export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')	// Remove punctuation
        .replace(/\d+/g, ' ')		// Remove numbers
        .split(/\s+/)				// Split on whitespace
        .filter(token => token.length > 2 && !STOP_WORDS.has(token))
        .map(token => simpleStem(token));
}

/**
 * Very basic suffix-stripping stemmer.
 * Not as accurate as Porter/Snowball, but zero dependencies.
 */
function simpleStem(word: string): string {
    if (word.length <= 4) return word;

    // Remove common suffixes
    const suffixes = ['tion', 'sion', 'ment', 'ness', 'ible', 'able', 'ful', 'less', 'ous', 'ive', 'ing', 'ies', 'ied', 'ers', 'est', 'ity', 'aly', 'ely', 'ize', 'ise', 'ify', 'ate', 'ent', 'ant', 'ary', 'ery', 'ory', 'ly', 'ed', 'er', 'es', 'al', 'en'];

    for (const suffix of suffixes) {
        if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
            return word.slice(0, word.length - suffix.length);
        }
    }

    // Remove trailing 's' for plurals
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
        return word.slice(0, -1);
    }

    return word;
}

/**
 * Computes term frequency map for a list of tokens.
 * Returns normalized TF values (count / total tokens).
 */
export function computeTF(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    const total = tokens.length;
    if (total === 0) return tf;

    for (const token of tokens) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    // Normalize by total token count
    for (const [term, count] of tf) {
        tf.set(term, count / total);
    }

    return tf;
}

/**
 * Computes inverse document frequency for all terms across all documents.
 * IDF = log(N / (1 + df)) where df = number of documents containing the term.
 */
export function computeIDF(documents: Map<string, number>[]): Map<string, number> {
    const idf = new Map<string, number>();
    const N = documents.length;
    if (N === 0) return idf;

    // Count document frequency for each term
    const df = new Map<string, number>();
    for (const doc of documents) {
        for (const term of doc.keys()) {
            df.set(term, (df.get(term) ?? 0) + 1);
        }
    }

    // Calculate IDF
    for (const [term, freq] of df) {
        idf.set(term, Math.log(N / (1 + freq)));
    }

    return idf;
}

/**
 * Computes TF-IDF vector for a single document given global IDF values.
 * Returns a sparse vector as a Map<term, tfidf_score>.
 */
export function computeTFIDF(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
    const tfidf = new Map<string, number>();

    for (const [term, tfValue] of tf) {
        const idfValue = idf.get(term) ?? 0;
        const score = tfValue * idfValue;
        if (score > 0) {
            tfidf.set(term, score);
        }
    }

    return tfidf;
}

/**
 * Computes cosine similarity between two sparse TF-IDF vectors.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [term, valA] of vecA) {
        normA += valA * valA;
        const valB = vecB.get(term);
        if (valB !== undefined) {
            dotProduct += valA * valB;
        }
    }

    for (const valB of vecB.values()) {
        normB += valB * valB;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
}
