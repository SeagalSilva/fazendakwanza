export interface MarketItem {
  itemId: string;
  name: string;
  currentPrice: number;
  basePrice: number;
  volume6h: number;
  trend: 'up' | 'down' | 'stable';
}

export type WeatherType = 'sunny' | 'rainy' | 'stormy' | 'heatwave' | 'drought';

export interface WeatherEffect {
  id: WeatherType;
  name: string;
  icon: string;
  description: string;
  growthMultiplier: number; // 1.0 = normal, 0.8 = 20% faster, 1.2 = 20% slower
  yieldMultiplier: number;
  affectedCategories?: string[];
}

export const WEATHER_EFFECTS: Record<WeatherType, WeatherEffect> = {
  sunny: {
    id: 'sunny',
    name: 'Ensolarado',
    icon: '☀️',
    description: 'Tempo ideal para o crescimento normal.',
    growthMultiplier: 1.0,
    yieldMultiplier: 1.0
  },
  rainy: {
    id: 'rainy',
    name: 'Chuvoso',
    icon: '🌧️',
    description: 'A chuva acelera o crescimento das plantas em 20%.',
    growthMultiplier: 0.8,
    yieldMultiplier: 1.0,
    affectedCategories: ['agricola']
  },
  stormy: {
    id: 'stormy',
    name: 'Tempestuoso',
    icon: '⛈️',
    description: 'Tempestades dificultam a colheita. Produção reduzida em 10%.',
    growthMultiplier: 1.1,
    yieldMultiplier: 0.9
  },
  heatwave: {
    id: 'heatwave',
    name: 'Onda de Calor',
    icon: '🔥',
    description: 'Calor intenso! Café e Cacau crescem 30% mais rápido.',
    growthMultiplier: 1.0,
    yieldMultiplier: 1.0
  },
  drought: {
    id: 'drought',
    name: 'Seca',
    icon: '🌵',
    description: 'Falta de água. Crescimento 50% mais lento.',
    growthMultiplier: 1.5,
    yieldMultiplier: 0.8
  }
};

export interface GameEvent {
  id: string;
  name: string;
  icon: string;
  description: string;
  type: 'bonus_yield' | 'price_boom' | 'xp_boost';
  multiplier: number;
  targetItemId?: string;
  targetCategory?: string;
  startTime: number;
  endTime: number;
}

export const EVENT_TEMPLATES = [
  { id: 'harvest_fest', name: 'Festival da Colheita', icon: '🎊', description: 'Bônus de 50% na colheita de todos os produtos agrícolas.', type: 'bonus_yield', multiplier: 1.5, targetCategory: 'agricola' },
  { id: 'animal_fair', name: 'Feira Pecuária', icon: '🐄', description: 'Produção animal dobrada (Leite e Ovos).', type: 'bonus_yield', multiplier: 2.0, targetCategory: 'pecuaria' },
  { id: 'market_boom', name: 'Boom do Mercado', icon: '📈', description: 'Preços de venda direta aumentados em 20%.', type: 'price_boom', multiplier: 1.2 },
  { id: 'xp_weekend', name: 'Fim de Semana XP', icon: '✨', description: 'Ganhe o dobro de XP em todas as atividades.', type: 'xp_boost', multiplier: 2.0 }
];

export interface FarmSlot {
  id: string;
  userId: string;
  area: 'cultivo' | 'curral' | 'galinheiro';
  type: 'empty' | 'crop' | 'animal';
  itemId?: string;
  plantedAt?: number;
  harvestAt?: number;
  watered?: boolean;
  lastFed?: number;
  harvestsRemaining?: number;
  requiredFoodId?: string;
  status: 'growing' | 'ready' | 'empty' | 'hungry';
}

export const COMMODITIES: Record<string, any> = {
  // Sementes (Seeds)
  milho_semente: { name: 'Semente de Milho', price: 10, category: 'semente', type: 'seed', product: 'milho' },
  cafe_semente: { name: 'Semente de Café', price: 50, category: 'semente', type: 'seed', product: 'cafe' },
  cacau_semente: { name: 'Semente de Cacau', price: 100, category: 'semente', type: 'seed', product: 'cacau' },
  vaca: { name: 'Vaca', price: 500, category: 'animal', type: 'animal', product: 'leite', consumes: 'racao_vaca', lifespan: 5 },
  galinha: { name: 'Galinha', price: 200, category: 'animal', type: 'animal', product: 'ovo', consumes: 'racao_galinha', lifespan: 5 },

  // Produtos (Products)
  milho: { name: 'Milho', basePrice: 50, growthTime: 60, category: 'agricola', rarity: 'common', seedDropChance: 0.2, type: 'crop' },
  cafe: { name: 'Café', basePrice: 200, growthTime: 300, category: 'agricola', rarity: 'uncommon', seedDropChance: 0.1, type: 'crop' },
  leite: { name: 'Leite', basePrice: 120, growthTime: 180, category: 'pecuaria', rarity: 'common', type: 'product' },
  cacau: { name: 'Cacau', basePrice: 350, growthTime: 600, category: 'agricola', rarity: 'rare', seedDropChance: 0.05, type: 'crop' },
  ovo: { name: 'Ovo', basePrice: 30, growthTime: 120, category: 'pecuaria', rarity: 'common', type: 'product' },
  chocolate: { name: 'Chocolate', basePrice: 800, category: 'industrial', rarity: 'rare', type: 'processed' },
  cafe_com_leite: { name: 'Café com Leite', basePrice: 400, category: 'industrial', rarity: 'uncommon', type: 'processed' },
  racao_vaca: { name: 'Ração para Vaca', basePrice: 40, category: 'industrial', rarity: 'common', type: 'processed' },
  racao_galinha: { name: 'Ração para Galinha', basePrice: 20, category: 'industrial', rarity: 'common', type: 'processed' },
};

export const RECIPES: Record<string, any> = {
  chocolate: {
    id: 'chocolate',
    name: 'Chocolate',
    inputs: [{ itemId: 'cacau', quantity: 2 }, { itemId: 'leite', quantity: 1 }],
    output: { itemId: 'chocolate', quantity: 1 },
    duration: 300
  },
  cafe_com_leite: {
    id: 'cafe_com_leite',
    name: 'Café com Leite',
    inputs: [{ itemId: 'cafe', quantity: 1 }, { itemId: 'leite', quantity: 1 }],
    output: { itemId: 'cafe_com_leite', quantity: 1 },
    duration: 120
  },
  racao_vaca: {
    id: 'racao_vaca',
    name: 'Ração para Vaca',
    inputs: [{ itemId: 'milho', quantity: 2 }],
    output: { itemId: 'racao_vaca', quantity: 5 },
    duration: 60
  },
  racao_galinha: {
    id: 'racao_galinha',
    name: 'Ração para Galinha',
    inputs: [{ itemId: 'milho', quantity: 1 }],
    output: { itemId: 'racao_galinha', quantity: 5 },
    duration: 30
  }
};

export const SLOT_PRICE = 5000; 

export function calculateNewPrice(item: MarketItem, totalVolumeSold: number): number {
  const targetVolume = 500; // Volume ideal para estabilidade
  const sensitivity = 2000;  // Sensibilidade da flutuação
  
  let newPrice = item.basePrice * (1 + (targetVolume - totalVolumeSold) / sensitivity);
  
  const minPrice = item.basePrice * 0.4;
  const maxPrice = item.basePrice * 4.0;
  
  return Math.max(minPrice, Math.min(maxPrice, newPrice));
}

export function getGrowthProgress(plantedAt: number, harvestAt: number): number {
  const now = Date.now();
  const total = harvestAt - plantedAt;
  const elapsed = now - plantedAt;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}
