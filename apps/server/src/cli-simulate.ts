import { runBenchmarkSuite } from '@catan/ai';

const gamesCount = Number(process.argv[2] ?? 10);
const seed = process.argv[3] ?? 'cli-bench-2026';

console.log(`Running AI vs. AI Benchmark (${gamesCount} games, seed="${seed}")...`);

const { report } = runBenchmarkSuite({
  baseSeed: seed,
  gamesCount,
  participants: [
    { id: 'p1', name: 'Expert Adaptiv', type: 'ai', aiDifficulty: 'expert', aiStyle: 'adaptive' },
    { id: 'p2', name: 'Avansat Dezvoltare', type: 'ai', aiDifficulty: 'advanced', aiStyle: 'development' },
    { id: 'p3', name: 'Mediu Expansiune', type: 'ai', aiDifficulty: 'medium', aiStyle: 'expansion' },
    { id: 'p4', name: 'Începător Comercial', type: 'ai', aiDifficulty: 'beginner', aiStyle: 'commercial' }
  ]
});

console.log(JSON.stringify(report, null, 2));
