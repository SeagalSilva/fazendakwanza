'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import WaterMiniGame from './WaterMiniGame';
import { 
  Sprout, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Package, 
  ClipboardList, 
  CreditCard,
  Sun,
  CloudRain,
  Wind,
  Plus,
  Timer,
  LogOut,
  Sparkles,
  Store,
  Building2,
  ArrowRightLeft,
  Settings,
  Users,
  PlusCircle,
  Trash2,
  Edit,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Coins,
  Check,
  Droplets,
  PawPrint,
  X
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { auth, db, rtdb } from '@/lib/firebase';
import { 
  ref, 
  onValue, 
  set, 
  update, 
  push, 
  child, 
  get, 
  runTransaction as runRtdbTransaction,
  increment as rtdbIncrement,
  off,
  remove
} from 'firebase/database';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where,
  getDocs,
  increment,
  runTransaction,
  orderBy,
  limit
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { COMMODITIES, FarmSlot, MarketItem, getGrowthProgress, SLOT_PRICE, RECIPES } from '@/lib/game-logic';

interface TransactionRecord {
  id: string;
  type: 'purchase' | 'sale' | 'deposit' | 'withdrawal_request' | 'listing' | 'p2p_buy' | 'p2p_sell';
  amountKZ: number;
  itemId?: string;
  quantity?: number;
  timestamp: number;
  status: string;
}

type WeatherType = 'sunny' | 'rainy' | 'stormy' | 'heatwave' | 'drought';

interface WeatherEffect {
  id: WeatherType;
  name: string;
  icon: string;
  description: string;
  growthMultiplier: number;
  yieldMultiplier: number;
  bonusCategory?: string;
}

const WEATHER_EFFECTS: Record<WeatherType, WeatherEffect> = {
  sunny: {
    id: 'sunny',
    name: 'Sunny',
    icon: '☀️',
    description: 'Ideal conditions for Coffee. Coffee production +20%.',
    growthMultiplier: 1.0,
    yieldMultiplier: 1.0,
    bonusCategory: 'coffee'
  },
  rainy: {
    id: 'rainy',
    name: 'Rainy',
    icon: '🌧️',
    description: 'Accelerated growth by 25% for all crops.',
    growthMultiplier: 1.25,
    yieldMultiplier: 1.0
  },
  stormy: {
    id: 'stormy',
    name: 'Stormy',
    icon: '⛈️',
    description: 'Risk of damage. Production reduced by 15%.',
    growthMultiplier: 0.8,
    yieldMultiplier: 0.85
  },
  heatwave: {
    id: 'heatwave',
    name: 'Heatwave',
    icon: '🔥',
    description: 'Ideal for Cotton. Cotton production +30%.',
    growthMultiplier: 0.9,
    yieldMultiplier: 1.0,
    bonusCategory: 'cotton'
  },
  drought: {
    id: 'drought',
    name: 'Drought',
    icon: '🌵',
    description: 'Slow growth (-30%). Save water!',
    growthMultiplier: 0.7,
    yieldMultiplier: 0.9
  }
};

interface GameEvent {
  id: string;
  name: string;
  icon: string;
  description: string;
  type: 'bonus_yield' | 'market_boom' | 'xp_boost';
  multiplier: number;
  startTime: number;
  endTime: number;
  targetItemId?: string;
}

const EVENT_TEMPLATES = {
  harvest_festival: {
    name: 'Harvest Festival',
    icon: '🌾',
    description: 'National celebration! All harvests yield 50% more.',
    type: 'bonus_yield',
    multiplier: 1.5
  },
  market_boom: {
    name: 'Export Boom',
    icon: '🚢',
    description: 'High international demand! Selling prices +30%.',
    type: 'market_boom',
    multiplier: 1.3
  },
  training_day: {
    name: 'Training Day',
    icon: '📚',
    description: 'Learn new techniques! XP gain doubled.',
    type: 'xp_boost',
    multiplier: 2.0
  }
};

interface MarketListing {
  id: string;
  sellerId: string;
  sellerName: string;
  itemId: string;
  quantity: number;
  pricePerUnit: number;
  timestamp: number;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleRtdbError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('RTDB Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function generateMockHistory(item: MarketItem) {
  const history = [];
  const now = new Date();
  let currentPrice = item.basePrice;
  
  // Use item.itemId to seed a pseudo-random sequence so it looks consistent
  let seed = 0;
  for (let i = 0; i < item.itemId.length; i++) {
    seed += item.itemId.charCodeAt(i);
  }

  for (let i = 14; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Pseudo-random fluctuation between -5% and +5%
    const fluctuation = (Math.sin(seed + i) * 0.1); 
    currentPrice = currentPrice * (1 + fluctuation);
    
    // Ensure it doesn't drop below 50% of base price or go above 200%
    currentPrice = Math.max(item.basePrice * 0.5, Math.min(item.basePrice * 2, currentPrice));

    if (i === 0) {
      currentPrice = item.currentPrice; // Today's price is the actual current price
    }

    history.push({
      date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      price: currentPrice
    });
  }
  return history;
}

export default function GameContainer() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [slots, setSlots] = useState<FarmSlot[]>([]);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [market, setMarket] = useState<MarketItem[]>([]);
  const [gameConfig, setGameConfig] = useState<any>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [depositRequests, setDepositRequests] = useState<any[]>([]);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [marketListings, setMarketListings] = useState<MarketListing[]>([]);
  const [productions, setProductions] = useState<Record<string, any>>({});
  const [displayProgress, setDisplayProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'farm' | 'market' | 'quests' | 'history' | 'sistema' | 'store' | 'water'>('farm');
  const [farmSubTab, setFarmSubTab] = useState<'cultivation' | 'corral' | 'production' | 'warehouse'>('cultivation');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedMarketItem, setSelectedMarketItem] = useState<MarketItem | null>(null);
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<string>('all');
  const [water, setWater] = useState<any>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [listingItem, setListingItem] = useState<{id: string, name: string, price: number} | null>(null);
  const [listingQty, setListingQty] = useState(1);
  const [listingPrice, setListingPrice] = useState(0);
  
  // Admin States
  const [adminSearchUser, setAdminSearchUser] = useState('');
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminEditingItem, setAdminEditingItem] = useState<any | null>(null);
  const [adminEditingRecipe, setAdminEditingRecipe] = useState<any | null>(null);
  const [adminEditingLevel, setAdminEditingLevel] = useState<any | null>(null);
  const [adminEditingWeatherEffect, setAdminEditingWeatherEffect] = useState<WeatherEffect | null>(null);
  const [adminActionUser, setAdminActionUser] = useState<any | null>(null);
  const [adminActionType, setAdminActionType] = useState<'give_item' | 'give_balance' | null>(null);
  const [adminActionValue, setAdminActionValue] = useState<number>(0);
  const [adminActionItemId, setAdminActionItemId] = useState<string>('');
  const [initialSlotsCount, setInitialSlotsCount] = useState<number>(9);
  const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{id: number, message: string, type: 'success' | 'error'}[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [userMissionProgress, setUserMissionProgress] = useState<Record<string, any>>({});
  const [adminEditingMission, setAdminEditingMission] = useState<any | null>(null);
  const [adminTab, setAdminTab] = useState<'financials' | 'weather' | 'missions' | 'commodities' | 'recipes' | 'levels' | 'users' | 'withdrawals' | 'deposits' | 'settings'>('financials');
  const [systemFinancials, setSystemFinancials] = useState({ playerDepositsMinusWithdrawals: 0, marketProfit: 0 });
  const [levelsConfig, setLevelsConfig] = useState<any[]>([]);
  const [weather, setWeather] = useState<WeatherType>('sunny');
  const [weatherEffects, setWeatherEffects] = useState<Record<WeatherType, WeatherEffect>>(WEATHER_EFFECTS);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ show: true, title, message, onConfirm });
  };

  const currentCommodities = React.useMemo(() => {
    if (!gameConfig?.commodities) return COMMODITIES;
    const merged: any = { ...COMMODITIES };
    Object.keys(gameConfig.commodities).forEach(key => {
      if (gameConfig.commodities[key] === null || gameConfig.commodities[key].deleted) {
        delete merged[key];
      } else if (merged[key]) {
        merged[key] = { 
          ...merged[key], 
          ...gameConfig.commodities[key], 
          category: (COMMODITIES as any)[key]?.category || gameConfig.commodities[key].category 
        };
      } else {
        merged[key] = gameConfig.commodities[key];
      }
    });
    return merged;
  }, [gameConfig?.commodities]);
  const currentRecipes = gameConfig?.recipes || RECIPES;

  const [scheduledEvents, setScheduledEvents] = useState<GameEvent[]>([]);
  const [activeEvents, setActiveEvents] = useState<GameEvent[]>([]);
  const [lastMarketPulse, setLastMarketPulse] = useState<number>(0);

  // Refs for state values needed in listeners to avoid re-subscribing
  const marketRefValue = useRef(market);
  const weatherRefValue = useRef(weather);
  const activeEventsRefValue = useRef(activeEvents);
  const isConnectedRefValue = useRef(isConnected);
  const isAdminRefValue = useRef(isAdmin);
  const currentCommoditiesRefValue = useRef<any>(COMMODITIES);

  useEffect(() => { marketRefValue.current = market; }, [market]);
  useEffect(() => { weatherRefValue.current = weather; }, [weather]);
  useEffect(() => { activeEventsRefValue.current = activeEvents; }, [activeEvents]);
  useEffect(() => { isConnectedRefValue.current = isConnected; }, [isConnected]);
  useEffect(() => { isAdminRefValue.current = isAdmin; }, [isAdmin]);
  useEffect(() => { currentCommoditiesRefValue.current = currentCommodities; }, [currentCommodities]);

  const influenceMarket = useCallback((itemId: string, percentChange: number, updates: Record<string, any>) => {
    if (!itemId || itemId === 'undefined' || typeof percentChange !== 'number' || isNaN(percentChange)) return;
    
    // Get info from commodities config
    const itemInfo = (currentCommoditiesRefValue.current as any)[itemId];
    if (!itemInfo || !itemInfo.basePrice) return; // Only influence items with basePrice

    // Find in current market state
    const marketItem = marketRefValue.current.find(m => m.itemId === itemId);
    
    // Use existing price or base price
    const currentPrice = marketItem?.currentPrice || itemInfo.basePrice;
    const basePrice = marketItem?.basePrice || itemInfo.basePrice;

    if (typeof currentPrice !== 'number' || isNaN(currentPrice)) return;

    // Apply volatility based on rarity
    const rarityMult = itemInfo?.rarity === 'rare' ? 1.5 : itemInfo?.rarity === 'uncommon' ? 1.2 : 1.0;
    
    let finalChange = percentChange * rarityMult;
    
    // Garante que a subida seja sempre menor que a descida
    if (finalChange > 0) {
      finalChange = finalChange * 0.5; // Reduz o impacto das altas pela metade
    }
    
    const newPrice = currentPrice * (1 + finalChange);
    
    const minPrice = basePrice * 0.3; // Allow deeper drops
    const maxPrice = basePrice * 5.0; // Allow higher peaks
    const boundedPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
    
    if (isNaN(boundedPrice)) return;

    // If not in market, initialize it in the updates (full object)
    if (!marketItem) {
      updates[`market/${itemId}`] = {
        itemId: itemId,
        name: itemInfo.name,
        currentPrice: boundedPrice,
        basePrice: basePrice,
        volume6h: Math.abs(finalChange * 500),
        trend: finalChange > 0 ? 'up' : 'down'
      };
    } else {
      // Otherwise, update specific fields
      updates[`market/${itemId}/currentPrice`] = boundedPrice;
      updates[`market/${itemId}/trend`] = finalChange > 0 ? 'up' : 'down';
      updates[`market/${itemId}/volume6h`] = rtdbIncrement(Math.abs(finalChange * 500));
    }
  }, []);
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventData, setNewEventData] = useState<Omit<GameEvent, 'id'>>({
    name: '',
    icon: '🎊',
    description: '',
    type: 'bonus_yield',
    multiplier: 1.5,
    startTime: Date.now(),
    endTime: Date.now() + 86400000
  });
  const completingRef = useRef<Set<string>>(new Set());

  const addNotification = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  const updateMissionProgress = useCallback(async (type: string, itemId: string, quantity: number) => {
    if (!user || !missions.length) return;

    const updates: Record<string, any> = {};
    const now = Date.now();

    missions.forEach(mission => {
      if (mission.type === type && (mission.targetItemId === itemId || !mission.targetItemId)) {
        const progress = { ...(userMissionProgress[mission.id] || { currentQuantity: 0, completed: false, claimed: false, lastReset: now }) };
        
        // Check reset (daily/weekly)
        const resetTime = mission.period === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        if (now - progress.lastReset > resetTime) {
          progress.currentQuantity = 0;
          progress.completed = false;
          progress.claimed = false;
          progress.lastReset = now;
        }

        if (!progress.completed) {
          progress.currentQuantity += quantity;
          if (progress.currentQuantity >= mission.targetQuantity) {
            progress.completed = true;
            addNotification(`Missão Concluída: ${mission.title}!`, 'success');
          }
          updates[`users/${user.uid}/missionProgress/${mission.id}`] = progress;
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      update(ref(rtdb), updates).catch(err => console.error('Failed to update mission progress:', err));
    }
  }, [user, missions, userMissionProgress]);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Check if admin
        setIsAdmin(u.email === 'seagalsilva@gmail.com' && u.emailVerified);

        try {
          // Check and Initialize User Data if missing
          const userRef = ref(rtdb, `users/${u.uid}`);
          const userSnap = await get(userRef).catch(err => {
            console.warn('Could not check user existence:', err);
            return null;
          });
          
          if (!userSnap || !userSnap.exists()) {
            console.log('Initializing new user data...');
            
            // Fetch global config for initial values
            const configRef = ref(rtdb, 'globalConfig/game');
            const configSnap = await get(configRef).catch(() => null);
            const configData = configSnap?.exists() ? configSnap.val().data : null;
            
            const startBalance = configData?.startingBalance ?? 1000;
            const startInventory = configData?.initialInventory ?? { milho: 5 };

            const updates: Record<string, any> = {};
            
            // 1. Profile
            updates[`users/${u.uid}`] = {
              uid: u.uid,
              name: u.displayName || 'Fazendeiro',
              email: u.email || '',
              balanceKZ: startBalance,
              xp: 0,
              level: 1,
              role: (u.email === 'seagalsilva@gmail.com' && u.emailVerified) ? 'admin' : 'user',
              lastLogin: new Date().toISOString()
            };
            
            // 2. Initial Farm Slots
            const slotsCount = configData?.initialSlotsCount ?? 9;
            for (let i = 0; i < slotsCount; i++) {
              const slotId = `slot_${i}`;
              updates[`farmSlots/${u.uid}/${slotId}`] = {
                id: slotId,
                userId: u.uid,
                area: 'cultivo',
                type: 'empty',
                status: 'empty'
              };
            }
            
            // 3. Starting Inventory
            Object.entries(startInventory).forEach(([itemId, qty]) => {
              updates[`inventory/${u.uid}/${itemId}`] = qty;
            });
            
            // 4. Welcome Transaction
            const transRef = push(ref(rtdb, `transactions/${u.uid}`));
            updates[`transactions/${u.uid}/${transRef.key}`] = {
              id: transRef.key,
              userId: u.uid,
              type: 'deposit',
              amountKZ: startBalance,
              timestamp: Date.now(),
              status: 'completed'
            };

            await update(ref(rtdb), updates).then(() => {
              console.log('User data successfully initialized!');
            }).catch(err => {
              console.error('Failed to initialize user data:', err);
            });
          }
        } catch (initErr) {
          console.error('User initialization process failed:', initErr);
        }
      } else {
        setProfile(null);
        setSlots([]);
        setInventory({});
        setTransactions([]);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Sync Listeners
  useEffect(() => {
    if (!user) return;

    const userRef = ref(rtdb, `users/${user.uid}`);
    const slotsRef = ref(rtdb, `farmSlots/${user.uid}`);
    const invRef = ref(rtdb, `inventory/${user.uid}`);
    const transRef = ref(rtdb, `transactions/${user.uid}`);
    const configRef = ref(rtdb, 'globalConfig/game');
    const marketRef = ref(rtdb, 'market');
    const listingsRef = ref(rtdb, 'marketListings');
    const systemRef = ref(rtdb, 'globalConfig/system');
    const levelsRef = ref(rtdb, 'globalConfig/game/levels');
    const productionsRef = ref(rtdb, `productions/${user.uid}`);
    const missionsRef = ref(rtdb, 'globalConfig/game/data/missions');
    const missionProgressRef = ref(rtdb, `users/${user.uid}/missionProgress`);
    const connectedRef = ref(rtdb, '.info/connected');

    const unsubProfile = onValue(userRef, (snap) => {
      if (snap.exists()) setProfile(snap.val());
    }, (err) => handleRtdbError(err, OperationType.GET, `users/${user.uid}`));

    const unsubWater = onValue(ref(rtdb, `users/${user.uid}/water`), (snap) => {
      setWater(snap.val());
    }, (err) => handleRtdbError(err, OperationType.GET, `users/${user.uid}/water`));

    const unsubConnected = onValue(connectedRef, (snap) => {
      setIsConnected(snap.val() === true);
    });

    const unsubProductions = onValue(productionsRef, (snap) => {
      setProductions(snap.val() || {});
    }, (err) => handleRtdbError(err, OperationType.LIST, `productions/${user.uid}`));

    const unsubMissions = onValue(missionsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const missionList = Object.entries(data).map(([id, val]: [string, any]) => ({
          ...val,
          id: val.id || id
        }));
        setMissions(missionList);
      } else {
        setMissions([]);
      }
    }, (err) => handleRtdbError(err, OperationType.LIST, 'globalConfig/game/data/missions'));

    const unsubMissionProgress = onValue(missionProgressRef, (snap) => {
      setUserMissionProgress(snap.val() || {});
    }, (err) => handleRtdbError(err, OperationType.GET, `users/${user.uid}/missionProgress`));

    const unsubSlots = onValue(slotsRef, (snap) => {
      const data = snap.val();
      if (data) {
        const s = (Object.values(data) as FarmSlot[]).map(slot => ({
          ...slot,
          area: slot.area || 'cultivo' // Fallback for old slots
        }));
        setSlots(s.sort((a, b) => a.id.localeCompare(b.id)));
      } else {
        setSlots([]);
      }
    }, (err) => handleRtdbError(err, OperationType.LIST, `farmSlots/${user.uid}`));

    const unsubInv = onValue(invRef, (snap) => {
      setInventory(snap.val() || {});
    }, (err) => handleRtdbError(err, OperationType.LIST, `inventory/${user.uid}`));

    const unsubTrans = onValue(transRef, (snap) => {
      const data = snap.val() || {};
      const t = (Object.values(data) as TransactionRecord[]).sort((a, b) => b.timestamp - a.timestamp);
      setTransactions(t.slice(0, 50));
    }, (err) => handleRtdbError(err, OperationType.LIST, `transactions/${user.uid}`));

    let unsubRequests = () => {};
    let unsubDepositRequests = () => {};
    if (isAdmin) {
      const requestsRef = ref(rtdb, 'withdrawalRequests');
      unsubRequests = onValue(requestsRef, (snap) => {
        const data = snap.val() || {};
        const r = Object.values(data) as any[];
        setWithdrawalRequests(r.sort((a, b) => b.timestamp - a.timestamp));
      }, (err) => handleRtdbError(err, OperationType.LIST, 'withdrawalRequests'));

      const depositRequestsRef = ref(rtdb, 'depositRequests');
      unsubDepositRequests = onValue(depositRequestsRef, (snap) => {
        const data = snap.val() || {};
        const r = Object.values(data) as any[];
        setDepositRequests(r.sort((a, b) => b.timestamp - a.timestamp));
      }, (err) => handleRtdbError(err, OperationType.LIST, 'depositRequests'));
    }

    const unsubConfig = onValue(configRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val().data;
        setGameConfig(data);
        if (data?.initialSlotsCount !== undefined) {
          setInitialSlotsCount(data.initialSlotsCount);
        }
      } else if (user.email === 'seagalsilva@gmail.com' && user.emailVerified) {
        // Initialize config ONLY if admin
        set(configRef, {
          id: 'game',
          data: {
            commodities: COMMODITIES,
            recipes: RECIPES,
            xpPerHarvest: 10,
            systemTax: 10,
            startingBalance: 1000,
            initialInventory: { milho: 5 },
            slotPrice: 5000,
            initialSlotsCount: 9
          }
        }).catch(err => console.warn('Config initialization failed:', err));
      }
    }, (err) => {
      console.warn('Config read failed (check RTDB rules):', err);
      // Don't throw here to prevent app crash
    });

    const unsubMarket = onValue(marketRef, (snap) => {
      if (!snap.exists()) {
        if (user.email === 'seagalsilva@gmail.com' && user.emailVerified) {
          // Initialize market ONLY if admin
          const initialMarket: Record<string, any> = {};
          Object.entries(COMMODITIES).forEach(([id, data]) => {
            initialMarket[id] = {
              itemId: id,
              name: data.name,
              currentPrice: data.basePrice,
              basePrice: data.basePrice,
              volume6h: 0,
              trend: 'stable'
            };
          });
          set(marketRef, initialMarket).catch(err => console.warn('Market initialization failed:', err));
        }
      } else {
        const marketData = snap.val() || {};
        const validMarket = Object.values(marketData).filter((item: any) => item && item.itemId && item.itemId !== 'undefined') as MarketItem[];
        setMarket(validMarket);
      }
    }, (err) => {
      console.warn('Market read failed (check RTDB rules):', err);
      // Don't throw here to prevent app crash
    });

    const unsubListings = onValue(listingsRef, (snap) => {
      if (snap.exists()) {
        setMarketListings(Object.values(snap.val()) as MarketListing[]);
      } else {
        setMarketListings([]);
      }
    });

    const unsubSystem = onValue(systemRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setSystemFinancials(data);
        
        // Market Pulse Logic: Triggered by any active client if 60s passed
        const now = Date.now();
        if (isConnectedRefValue.current && (!data.lastMarketPulse || now - data.lastMarketPulse > 60000)) {
          const updates: Record<string, any> = {};
          updates['globalConfig/system/lastMarketPulse'] = now;
          
          // Iterate over all commodities that should be in the market
          Object.entries(currentCommoditiesRefValue.current).forEach(([id, itemInfo]: [string, any]) => {
            if (!itemInfo || !itemInfo.basePrice) return; // Only products/processed items are in the market
            
            // Find current market data
            const marketItem = marketRefValue.current.find(m => m.itemId === id);
            
            // 1. Random noise (-1.5% to +1.5%)
            let fluctuation = (Math.random() * 0.03 - 0.015);
            
            // 2. Drift towards base price (0.5% correction)
            const basePrice = itemInfo.basePrice;
            const currentPrice = marketItem?.currentPrice || basePrice;
            const drift = (basePrice - currentPrice) / basePrice * 0.005;
            if (!isNaN(drift)) fluctuation += drift;
            
            // 3. Weather influence
            if (weatherRefValue.current === 'drought') {
              if (itemInfo.category === 'agricola') fluctuation += 0.008;
              if (itemInfo.category === 'pecuaria') fluctuation += 0.003;
            }
            if (weatherRefValue.current === 'rainy') {
              if (itemInfo.category === 'agricola') fluctuation -= 0.005;
            }
            if (weatherRefValue.current === 'heatwave') {
              if (id === 'cafe' || id === 'cacau') fluctuation -= 0.01;
            }
            if (weatherRefValue.current === 'stormy') {
              fluctuation += 0.005;
            }
            
            // 4. Event influence
            const priceBoom = activeEventsRefValue.current.find(e => e.type === 'market_boom');
            if (priceBoom && (!priceBoom.targetItemId || priceBoom.targetItemId === id)) {
              fluctuation += 0.02; // Stronger upward pressure during boom
            }

            if (!isNaN(fluctuation)) {
              influenceMarket(id, fluctuation, updates);
            }
          });

          if (Object.keys(updates).length > 1) {
            update(ref(rtdb), updates).catch(() => {});
          }
        }
      } else if (isAdminRefValue.current) {
        set(systemRef, { playerDepositsMinusWithdrawals: 0, marketProfit: 0, lastMarketPulse: Date.now() });
      }
    });

    const unsubLevels = onValue(levelsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setLevelsConfig(Object.values(data).sort((a: any, b: any) => a.level - b.level));
      } else if (isAdmin) {
        const initialLevels = [
          { level: 1, xpRequired: 0, rewardKZ: 0 },
          { level: 2, xpRequired: 100, rewardKZ: 500 },
          { level: 3, xpRequired: 300, rewardKZ: 1000 },
          { level: 4, xpRequired: 600, rewardKZ: 2000 },
          { level: 5, xpRequired: 1000, rewardKZ: 5000 },
        ];
        const updates: any = {};
        initialLevels.forEach(l => {
          updates[l.level] = l;
        });
        set(levelsRef, updates);
      }
    });

    const weatherRef = ref(rtdb, 'globalConfig/weather');
    const unsubWeather = onValue(weatherRef, (snap) => {
      if (snap.exists()) {
        setWeather(snap.val() as WeatherType);
      } else if (isAdmin) {
        set(weatherRef, 'sunny');
      }
    });

    const weatherEffectsRef = ref(rtdb, 'globalConfig/weatherEffects');
    const unsubWeatherEffects = onValue(weatherEffectsRef, (snap) => {
      if (snap.exists()) {
        setWeatherEffects(snap.val());
      } else if (isAdmin) {
        set(weatherEffectsRef, WEATHER_EFFECTS);
      }
    });

    const eventsRef = ref(rtdb, 'globalConfig/scheduledEvents');
    const unsubEvents = onValue(eventsRef, (snap) => {
      if (snap.exists()) {
        const events = Object.values(snap.val()) as GameEvent[];
        setScheduledEvents(events);
        
        const now = Date.now();
        const active = events.filter(e => now >= e.startTime && now <= e.endTime);
        setActiveEvents(active);
      } else {
        setScheduledEvents([]);
        setActiveEvents([]);
      }
    });

    const intervals = {};
    return () => {
      off(userRef);
      off(slotsRef);
      off(invRef);
      off(transRef);
      off(configRef);
      off(marketRef);
      off(listingsRef);
      off(systemRef);
      off(levelsRef);
      off(weatherRef);
      off(weatherEffectsRef);
      off(eventsRef);
      off(missionsRef);
      off(missionProgressRef);
      unsubRequests();
      unsubDepositRequests();
      unsubConnected();
      unsubWater();
      unsubProductions();
      unsubMissions();
      unsubMissionProgress();
    };
  }, [user, isAdmin, influenceMarket]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      if (error.code === 'auth/unauthorized-domain') {
        addNotification(
          'Unauthorized Domain Error! Add AI Studio domains to your Firebase Console.',
          'error'
        );
      } else {
        console.error('Erro de login:', error);
      }
    }
  };

  const plantCrop = async (slotId: string, seedId: string, now: number) => {
    const seed = currentCommodities[seedId as keyof typeof currentCommodities];
    if (!seed || (seed.type !== 'seed' && seed.type !== 'animal')) return;
    
    const productId = seed.product;
    const product = currentCommodities[productId as keyof typeof currentCommodities];
    if (!product) return;

    const qty = inventory[seedId] || 0;
    if (qty <= 0) return;
    
    const updates: Record<string, any> = {};
    updates[`inventory/${user.uid}/${seedId}`] = rtdbIncrement(-1);
    
    const growthMultiplier = weatherEffects[weather]?.growthMultiplier || 1.0;
    const finalGrowthTime = (product.growthTime / growthMultiplier) * 1000;

    const slotData: any = {
      id: slotId,
      userId: user.uid,
      area: seed.type === 'animal' ? 'curral' : 'cultivo',
      type: seed.type === 'animal' ? 'animal' : 'crop',
      itemId: productId,
      status: 'growing',
      plantedAt: now,
      harvestAt: now + finalGrowthTime,
      harvestsRemaining: seed.type === 'animal' ? (seed.lifespan || 5) : 1 // Animals live for configured harvests
    };

    // Store the required food ID in the slot if it's an animal
    if (seed.type === 'animal' && seed.consumes) {
      slotData.requiredFoodId = seed.consumes;
    }

    updates[`farmSlots/${user.uid}/${slotId}`] = slotData;

    update(ref(rtdb), updates)
      .then(() => {
        updateMissionProgress('plant', seedId, 1);
      })
      .catch(err => handleRtdbError(err, OperationType.WRITE, `farmSlots/${user.uid}/${slotId}`));
  };

  const waterCrop = async (slotId: string) => {
    if ((water?.balance || 0) < 1) return; // Need at least 1 water
    
    const slot = slots.find(s => s.id === slotId);
    if (!slot || !slot.plantedAt || !slot.harvestAt || slot.watered) return;

    const now = Date.now();
    const remainingTime = slot.harvestAt - now;
    if (remainingTime <= 0) return;

    const newHarvestAt = now + (remainingTime / 2);

    const updates: Record<string, any> = {};
    updates[`users/${user.uid}/water/balance`] = rtdbIncrement(-1);
    updates[`farmSlots/${user.uid}/${slotId}/watered`] = true;
    updates[`farmSlots/${user.uid}/${slotId}/harvestAt`] = newHarvestAt;
    
    update(ref(rtdb), updates)
      .then(() => {
        updateMissionProgress('water', '', 1);
      })
      .catch(err => handleRtdbError(err, OperationType.WRITE, `farmSlots/${user.uid}/${slotId}`));
  };

  const buySeed = async (itemId: string, now: number) => {
    const commodity = currentCommodities[itemId as keyof typeof currentCommodities];
    if (!commodity || !('price' in commodity)) return;
    
    const price = commodity.price;
    if (!profile || profile.balanceKZ < price) {
      addNotification('Insufficient balance to buy this seed!', 'error');
      return;
    }
    
    const updates: Record<string, any> = {};
    updates[`users/${user.uid}/balanceKZ`] = rtdbIncrement(-price);
    updates[`globalConfig/system/marketProfit`] = rtdbIncrement(price);
    updates[`inventory/${user.uid}/${itemId}`] = rtdbIncrement(1);

    // Buying seeds indicates future supply, slightly lowering the product's market price
    const productItemId = commodity.product;
    if (productItemId) {
      influenceMarket(productItemId, -0.005, updates); // -0.5% influence
    }

    const transRef = push(ref(rtdb, `transactions/${user.uid}`));
    updates[`transactions/${user.uid}/${transRef.key}`] = {
      id: transRef.key,
      userId: user.uid,
      type: 'purchase',
      amountKZ: price,
      itemId,
      quantity: 1,
      timestamp: now,
      status: 'completed'
    };

    update(ref(rtdb), updates)
      .then(() => {
        addNotification(`Purchase of ${commodity.name} successful!`, 'success');
        updateMissionProgress('buy', itemId, 1);
      })
      .catch(err => {
        handleRtdbError(err, OperationType.WRITE, `inventory/${user.uid}/${itemId}`);
        addNotification('Error processing purchase.', 'error');
      });
  };

  const harvestCrop = async (slotId: string) => {
    const slot = slots.find(s => s.id === slotId);
    if (!slot || slot.status !== 'ready' || !slot.itemId || !profile) return;

    const itemInfo = (currentCommodities as any)[slot.itemId!];
    const updates: Record<string, any> = {};
    
    const weatherYieldMultiplier = weatherEffects[weather]?.yieldMultiplier || 1.0;
    const eventYieldMultiplier = activeEvents.filter(e => e.type === 'bonus_yield').reduce((acc, e) => acc * e.multiplier, 1.0);
    const eventXpMultiplier = activeEvents.filter(e => e.type === 'xp_boost').reduce((acc, e) => acc * e.multiplier, 1.0);
    
    const finalYield = Math.max(1, Math.round(1 * weatherYieldMultiplier * eventYieldMultiplier));
    const xpGain = Math.round((gameConfig?.xpPerHarvest || 10) * eventXpMultiplier);

    updates[`inventory/${user.uid}/${slot.itemId}`] = rtdbIncrement(finalYield);
    
    // Harvesting increases supply, slightly lowering the market price
    influenceMarket(slot.itemId!, -0.001, updates); // -0.1% influence

    if (itemInfo?.type === 'animal') {
      const remaining = (slot.harvestsRemaining || 1) - 1;
      if (remaining > 0) {
        // Animal stays but becomes hungry
        updates[`farmSlots/${user.uid}/${slotId}/harvestsRemaining`] = remaining;
        updates[`farmSlots/${user.uid}/${slotId}/status`] = 'hungry';
        updates[`farmSlots/${user.uid}/${slotId}/plantedAt`] = null;
        updates[`farmSlots/${user.uid}/${slotId}/harvestAt`] = null;
      } else {
        // Animal dies
        updates[`farmSlots/${user.uid}/${slotId}`] = {
          id: slotId,
          userId: user.uid,
          area: slot.area,
          type: 'empty',
          status: 'empty'
        };
      }
    } else {
      // Crop is removed
      updates[`farmSlots/${user.uid}/${slotId}`] = {
        id: slotId,
        userId: user.uid,
        area: slot.area,
        type: 'empty',
        status: 'empty'
      };
    }

    updates[`users/${user.uid}/xp`] = rtdbIncrement(xpGain);

    // Check level up (using local state for check, but atomic increment for data)
    const newXp = (profile.xp || 0) + xpGain;
    const nextLevel = levelsConfig.find(l => l.level === (profile.level || 1) + 1);
    if (nextLevel && newXp >= nextLevel.xpRequired) {
      updates[`users/${user.uid}/level`] = nextLevel.level;
      updates[`users/${user.uid}/balanceKZ`] = rtdbIncrement(nextLevel.rewardKZ || 0);
      // System pays reward
      updates[`globalConfig/system/playerDepositsMinusWithdrawals`] = rtdbIncrement(-(nextLevel.rewardKZ || 0));
    }

    update(ref(rtdb), updates)
      .then(() => {
        updateMissionProgress('harvest', slot.itemId!, finalYield);
      })
      .catch(err => handleRtdbError(err, OperationType.WRITE, `farmSlots/${user.uid}/${slotId}`));
  };

  const feedAnimal = useCallback(async (slotId: string, feedItemId: string) => {
    const slot = slots.find(s => s.id === slotId);
    if (!user) {
      addNotification('User not authenticated.', 'error');
      return;
    }
    if (!slot) {
      addNotification('Slot not found.', 'error');
      return;
    }
    if (slot.status !== 'hungry') {
      addNotification('This animal is not hungry.', 'error');
      return;
    }

    const qty = inventory[feedItemId] || 0;
    if (qty <= 0) {
      addNotification('You do not have this food in the warehouse!', 'error');
      return;
    }

    const product = currentCommodities[slot.itemId as keyof typeof currentCommodities];
    if (!product) {
      addNotification('Product information not found.', 'error');
      return;
    }
    
    // Find the animal (seed) that produces this item to get the fallback food requirement
    const animalItem: any = Object.values(currentCommodities).find((c: any) => c.type === 'animal' && c.product === slot.itemId);
    const fallbackFoodId = animalItem?.consumes;
    
    // Use the food ID stored in the slot, or fallback to the animal's setting
    const requiredFoodId = (slot as any).requiredFoodId || fallbackFoodId;
    
    if (requiredFoodId && requiredFoodId !== feedItemId) {
      addNotification(`This animal only eats ${currentCommodities[requiredFoodId]?.name || 'other food'}!`, 'error');
      return;
    }

    const now = Date.now();
    const updates: Record<string, any> = {};
    updates[`inventory/${user.uid}/${feedItemId}`] = rtdbIncrement(-1);
    updates[`farmSlots/${user.uid}/${slotId}/status`] = 'growing';
    updates[`farmSlots/${user.uid}/${slotId}/lastFed`] = now;
    updates[`farmSlots/${user.uid}/${slotId}/plantedAt`] = now;
    updates[`farmSlots/${user.uid}/${slotId}/harvestAt`] = now + (product.growthTime || 60) * 1000;
    
    // Ensure requiredFoodId is stored in the slot if it was missing
    if (!(slot as any).requiredFoodId && fallbackFoodId) {
      updates[`farmSlots/${user.uid}/${slotId}/requiredFoodId`] = fallbackFoodId;
    }

    // Feeding consumes food, slightly increasing its market price
    influenceMarket(feedItemId, 0.001, updates); // +0.1% influence

    update(ref(rtdb), updates).then(() => {
      addNotification(`Animal fed with ${currentCommodities[feedItemId]?.name}!`);
      updateMissionProgress('feed', feedItemId, 1);
    }).catch(err => {
      addNotification('Error feeding animal on the server.', 'error');
      handleRtdbError(err, OperationType.WRITE, `farmSlots/${user.uid}/${slotId}`);
    });
  }, [user, slots, inventory, currentCommodities, influenceMarket, updateMissionProgress]);

  const completeProduction = useCallback(async (recipeId: string) => {
    if (!user || completingRef.current.has(recipeId)) return;
    const recipe = currentRecipes[recipeId as keyof typeof currentRecipes];
    if (!recipe) return;

    completingRef.current.add(recipeId);
    const prodRef = ref(rtdb, `productions/${user.uid}/${recipeId}`);
    
    try {
      const result = await runRtdbTransaction(prodRef, (currentData) => {
        if (currentData === null) return undefined; // Already completed or doesn't exist
        return null; // Mark as completed by removing it
      });

      if (result.committed) {
        const updates: Record<string, any> = {};
        // Add output
        updates[`inventory/${user.uid}/${recipe.output.itemId}`] = rtdbIncrement(recipe.output.quantity);

        // Producing items increases supply, slightly lowering their market price
        influenceMarket(recipe.output.itemId, -0.001 * recipe.output.quantity, updates);

        // Transaction record
        const transRef = push(ref(rtdb, `transactions/${user.uid}`));
        updates[`transactions/${user.uid}/${transRef.key}`] = {
          id: transRef.key,
          userId: user.uid,
          type: 'production' as any,
          amountKZ: 0,
          itemId: recipe.output.itemId,
          quantity: recipe.output.quantity,
          timestamp: Date.now(),
          status: 'completed'
        };

        await update(ref(rtdb), updates);
        updateMissionProgress('produce', recipe.output.itemId, recipe.output.quantity);
      }
    } catch (err: any) {
      // Handle disconnect error gracefully
      if (err?.message === 'disconnect') {
        console.warn('RTDB Disconnected during production completion. Will retry when reconnected.');
      } else {
        handleRtdbError(err, OperationType.WRITE, `productions/${user.uid}/${recipeId}`);
      }
    } finally {
      completingRef.current.delete(recipeId);
    }
  }, [user, currentRecipes, updateMissionProgress, influenceMarket]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newProgress: Record<string, number> = {};
      let hasProductions = false;
      
      Object.entries(productions).forEach(([recipeId, data]: [string, any]) => {
        hasProductions = true;
        const elapsed = (now - data.startTime) / 1000;
        const progress = Math.min(100, (elapsed / data.duration) * 100);
        newProgress[recipeId] = progress;

        if (progress >= 100 && isConnected) {
          // Auto-complete
          completeProduction(recipeId);
        }
      });
      
      setDisplayProgress(prev => {
        if (!hasProductions && Object.keys(prev).length === 0) return prev;
        return newProgress;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [productions, completeProduction, isConnected]);

  const produceItem = useCallback(async (recipeId: string) => {
    const recipe = currentRecipes[recipeId as keyof typeof currentRecipes];
    if (!recipe || !user || productions[recipeId] || !profile) return;

    // Check balance for production tax
    const tax = gameConfig?.productionTaxKZ || 0;
    if (profile.balanceKZ < tax) {
      addNotification(`Insufficient balance to pay the production tax (${tax} KZ)!`, 'error');
      return;
    }

    // Check inputs
    for (const input of recipe.inputs) {
      if ((inventory[input.itemId] || 0) < input.quantity) {
        addNotification(`Insufficient ingredients!`, 'error');
        return;
      }
    }

    const duration = recipe.duration || 5;
    const startTime = Date.now();
    const endTime = startTime + duration * 1000;

    const updates: Record<string, any> = {};
    
    // Deduct tax
    if (tax > 0) {
      updates[`users/${user.uid}/balanceKZ`] = rtdbIncrement(-tax);
      updates[`globalConfig/system/marketProfit`] = rtdbIncrement(tax);
    }

    // Consume inputs
    for (const input of recipe.inputs) {
      updates[`inventory/${user.uid}/${input.itemId}`] = rtdbIncrement(-input.quantity);
      
      // Consuming ingredients slightly increases their market price
      const marketItem = market.find(m => m.itemId === input.itemId);
      if (marketItem) {
        const newPrice = marketItem.currentPrice * (1 + (0.001 * input.quantity)); // +0.1% per unit
        const minPrice = marketItem.basePrice * 0.4;
        const maxPrice = marketItem.basePrice * 4.0;
        const boundedPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
        updates[`market/${input.itemId}/currentPrice`] = boundedPrice;
      }
    }
    // Start production
    updates[`productions/${user.uid}/${recipeId}`] = {
      recipeId,
      startTime,
      duration,
      endTime
    };

    await update(ref(rtdb), updates).catch(err => handleRtdbError(err, OperationType.WRITE, `productions/${user.uid}`));
  }, [user, inventory, currentRecipes, productions, profile, gameConfig, market]);

  const sellItem = async (itemId: string, now: number) => {
    const qty = inventory[itemId] || 0;
    if (qty <= 0 || !profile) return;

    const itemInfo = (currentCommodities as any)[itemId];
    const marketItem = market.find(m => m.itemId === itemId);
    
    // Fallback to basePrice if not in market
    const currentPrice = marketItem?.currentPrice || itemInfo?.basePrice || 0;
    const basePrice = marketItem?.basePrice || itemInfo?.basePrice || 0;

    if (currentPrice <= 0) {
      addNotification('This item has no market value!', 'error');
      return;
    }

    const taxRate = (gameConfig?.systemTax || 10) / 100;
    const tax = currentPrice * taxRate;
    const netAmount = currentPrice - tax;

    const updates: Record<string, any> = {};
    updates[`inventory/${user.uid}/${itemId}`] = rtdbIncrement(-1);
    updates[`users/${user.uid}/balanceKZ`] = rtdbIncrement(netAmount);
    updates[`globalConfig/system/playerDepositsMinusWithdrawals`] = rtdbIncrement(-netAmount);
    // No marketProfit update for selling to system
    
    if (marketItem) {
      // Vender para o sistema sempre reduz o preço (-2% a 0%)
      const fluctuation = -(Math.random() * 0.02);
      influenceMarket(itemId, fluctuation, updates);
    }

    const transRef = push(ref(rtdb, `transactions/${user.uid}`));
    updates[`transactions/${user.uid}/${transRef.key}`] = {
      id: transRef.key,
      userId: user.uid,
      type: 'sale',
      amountKZ: netAmount,
      itemId,
      quantity: 1,
      timestamp: now,
      status: 'completed'
    };

    update(ref(rtdb), updates)
      .then(() => {
        updateMissionProgress('sell', itemId, 1);
      })
      .catch(err => handleRtdbError(err, OperationType.WRITE, `market/${itemId}`));
  };

  const buySlot = async (area: 'cultivo' | 'curral') => {
    const price = gameConfig?.slotPrice || SLOT_PRICE;
    if (!profile || profile.balanceKZ < price) {
      addNotification('Insufficient balance to buy a new slot!', 'error');
      return;
    }
    
    const slotId = `slot_${slots.length}`;
    const updates: Record<string, any> = {};
    updates[`users/${user.uid}/balanceKZ`] = rtdbIncrement(-price);
    updates[`globalConfig/system/marketProfit`] = rtdbIncrement(price);
    updates[`farmSlots/${user.uid}/${slotId}`] = {
      id: slotId,
      userId: user.uid,
      area,
      type: 'empty',
      status: 'empty'
    };

    const transRef = push(ref(rtdb, `transactions/${user.uid}`));
    updates[`transactions/${user.uid}/${transRef.key}`] = {
      id: transRef.key,
      userId: user.uid,
      type: 'purchase',
      amountKZ: price,
      itemId: 'slot',
      quantity: 1,
      timestamp: Date.now(),
      status: 'completed'
    };

    update(ref(rtdb), updates)
      .then(() => addNotification(`Novo slot de ${area} adquirido!`, 'success'))
      .catch(err => {
        handleRtdbError(err, OperationType.WRITE, `farmSlots/${user.uid}/${slotId}`);
        addNotification('Erro ao adquirir slot.', 'error');
      });
  };

  const listOnMarket = async (itemId: string, quantity: number, pricePerUnit: number, now: number) => {
    const currentQty = inventory[itemId] || 0;
    if (currentQty < quantity || !profile) return;

    const listingRef = push(ref(rtdb, 'marketListings'));
    const updates: Record<string, any> = {};
    updates[`inventory/${user.uid}/${itemId}`] = rtdbIncrement(-quantity);
    updates[`marketListings/${listingRef.key}`] = {
      id: listingRef.key,
      sellerId: user.uid,
      sellerName: profile.name,
      itemId,
      quantity,
      pricePerUnit,
      timestamp: now
    };

    const transRef = push(ref(rtdb, `transactions/${user.uid}`));
    updates[`transactions/${user.uid}/${transRef.key}`] = {
      id: transRef.key,
      userId: user.uid,
      type: 'listing',
      amountKZ: 0,
      itemId,
      quantity,
      timestamp: now,
      status: 'completed'
    };

    update(ref(rtdb), updates).catch(err => handleRtdbError(err, OperationType.WRITE, `marketListings`));
  };

  const buyFromMarket = async (listing: MarketListing, now: number) => {
    const totalPrice = listing.pricePerUnit * listing.quantity;
    if (!profile || profile.balanceKZ < totalPrice) {
      addNotification('Insufficient balance for this market purchase!', 'error');
      return;
    }
    if (listing.sellerId === user.uid) return;

    const taxRate = (gameConfig?.systemTax || 10) / 100;
    const tax = totalPrice * taxRate;
    const netAmount = totalPrice - tax;

    const updates: Record<string, any> = {};
    
    // Buyer updates
    updates[`users/${user.uid}/balanceKZ`] = rtdbIncrement(-totalPrice);
    updates[`inventory/${user.uid}/${listing.itemId}`] = rtdbIncrement(listing.quantity);
    
    // Seller updates
    updates[`users/${listing.sellerId}/balanceKZ`] = rtdbIncrement(netAmount);

    // System updates
    updates[`globalConfig/system/marketProfit`] = rtdbIncrement(tax);

    // Influence global market price based on P2P sale
    // Move global price towards P2P price. Weight depends on quantity (max 50% shift)
    const marketItem = market.find(m => m.itemId === listing.itemId);
    if (marketItem) {
      const weight = Math.min(0.5, listing.quantity * 0.005);
      const priceDiff = (listing.pricePerUnit - marketItem.currentPrice) / marketItem.currentPrice;
      influenceMarket(listing.itemId, priceDiff * weight, updates);
      updates[`market/${listing.itemId}/volume6h`] = rtdbIncrement(listing.quantity);
    }

    // Remove listing
    updates[`marketListings/${listing.id}`] = null;

    // Transactions
    const buyerTransRef = push(ref(rtdb, `transactions/${user.uid}`));
    updates[`transactions/${user.uid}/${buyerTransRef.key}`] = {
      id: buyerTransRef.key,
      userId: user.uid,
      type: 'p2p_buy',
      amountKZ: totalPrice,
      itemId: listing.itemId,
      quantity: listing.quantity,
      timestamp: now,
      status: 'completed'
    };

    const sellerTransRef = push(ref(rtdb, `transactions/${listing.sellerId}`));
    updates[`transactions/${listing.sellerId}/${sellerTransRef.key}`] = {
      id: sellerTransRef.key,
      userId: listing.sellerId,
      type: 'p2p_sell',
      amountKZ: netAmount,
      itemId: listing.itemId,
      quantity: listing.quantity,
      timestamp: now,
      status: 'completed'
    };

    update(ref(rtdb), updates)
      .then(() => addNotification(`Compra de ${listing.quantity}x ${currentCommodities[listing.itemId]?.name || listing.itemId} realizada!`, 'success'))
      .catch(err => {
        handleRtdbError(err, OperationType.WRITE, `marketListings/${listing.id}`);
        addNotification('Erro ao processar compra no mercado.', 'error');
      });
  };

  const cancelListing = async (listing: MarketListing) => {
    if (listing.sellerId !== user.uid) return;

    const updates: Record<string, any> = {};
    updates[`inventory/${user.uid}/${listing.itemId}`] = rtdbIncrement(listing.quantity);
    updates[`marketListings/${listing.id}`] = null;

    update(ref(rtdb), updates).catch(err => handleRtdbError(err, OperationType.WRITE, `marketListings`));
  };

  const adminDeleteCommodity = async (itemId: string) => {
    if (!isAdmin) return;
    const updates: Record<string, any> = {};
    // Para apagar definitivamente, marcamos como deletado se for um item padrão,
    // ou removemos se for um item customizado.
    // Na verdade, definir como { deleted: true } funciona para ambos no nosso merge logic.
    updates[`globalConfig/game/data/commodities/${itemId}`] = { deleted: true };
    updates[`market/${itemId}`] = null;
    
    update(ref(rtdb), updates).then(() => {
      setAdminEditingItem(null);
      setItemToDeleteId(null);
      addNotification('Item permanently deleted!', 'success');
    }).catch(err => {
      console.error('Admin delete failed:', err);
      addNotification('Error deleting item.', 'error');
    });
  };

  const adminUpdateCommodity = async (itemId: string, data: any) => {
    if (!isAdmin) return;
    const updates: Record<string, any> = {};
    updates[`globalConfig/game/data/commodities/${itemId}`] = {
      ...data,
      icon: data.icon || ''
    };
    
    // Only update market if it's a product (not a seed/animal)
    if (data.type !== 'seed' && data.type !== 'animal') {
      updates[`market/${itemId}/name`] = data.name;
      updates[`market/${itemId}/basePrice`] = data.basePrice;
      updates[`market/${itemId}/category`] = data.category || 'crop';
    } else {
      // If it became a seed/animal, remove from market if it was there
      updates[`market/${itemId}`] = null;
    }
    
    update(ref(rtdb), updates).then(() => {
      addNotification(`Item ${data.name} updated!`, 'success');
      setAdminEditingItem(null);
    }).catch(err => {
      console.error('Admin update failed:', err);
      addNotification('Error updating item.', 'error');
    });
  };

  const adminAddCommodity = async (itemId: string, data: any) => {
    if (!isAdmin) return;
    const updates: Record<string, any> = {};
    updates[`globalConfig/game/data/commodities/${itemId}`] = {
      ...data,
      icon: data.icon || ''
    };
    
    if (data.type !== 'seed' && data.type !== 'animal') {
      updates[`market/${itemId}`] = {
        itemId,
        name: data.name,
        currentPrice: data.basePrice,
        basePrice: data.basePrice,
        volume6h: 0,
        trend: 'stable',
        category: data.category || 'crop'
      };
    }
    
    update(ref(rtdb), updates).then(() => {
      addNotification(`Item ${data.name} added!`, 'success');
      setAdminEditingItem(null);
    }).catch(err => {
      console.error('Admin add failed:', err);
      addNotification('Error adding item.', 'error');
    });
  };

  const adminUpdateRecipe = async (recipeId: string, data: any) => {
    if (!isAdmin) return;
    update(ref(rtdb, `globalConfig/game/data/recipes/${recipeId}`), data).then(() => {
      setAdminEditingRecipe(null);
    }).catch(err => console.error('Admin update recipe failed:', err));
  };

  const adminAddRecipe = async (recipeId: string, data: any) => {
    if (!isAdmin) return;
    update(ref(rtdb, `globalConfig/game/data/recipes/${recipeId}`), data).then(() => {
      setAdminEditingRecipe(null);
    }).catch(err => console.error('Admin add recipe failed:', err));
  };

  const adminDeleteRecipe = async (recipeId: string) => {
    if (!isAdmin) return;
    remove(ref(rtdb, `globalConfig/game/data/recipes/${recipeId}`)).catch(err => console.error('Admin delete recipe failed:', err));
  };

  const adminGiveItemToUser = async (userId: string, itemId: string, quantity: number) => {
    if (!isAdmin) return;
    update(ref(rtdb), { [`inventory/${userId}/${itemId}`]: rtdbIncrement(quantity) }).then(() => {
      setAdminActionUser(null);
    }).catch(err => console.error('Admin give item failed:', err));
  };

  const adminUpdateInitialSlots = async (count: number) => {
    if (!isAdmin) return;
    update(ref(rtdb, 'globalConfig/game/data'), { initialSlotsCount: count })
      .then(() => addNotification(`Slots iniciais atualizados para ${count}!`, 'success'))
      .catch(err => addNotification('Erro ao atualizar slots iniciais.', 'error'));
  };

  const adminResetFinancials = async () => {
    if (!isAdmin) return;
    
    askConfirmation(
      'Reset Financial System',
      'ARE YOU SURE? This will reset the system bank balance and market profit to ZERO.',
      () => {
        const systemRef = ref(rtdb, 'globalConfig/system');
        set(systemRef, { playerDepositsMinusWithdrawals: 0, marketProfit: 0 })
          .then(() => addNotification('Financial system reset!', 'success'))
          .catch(err => addNotification('Error resetting financial system.', 'error'));
      }
    );
  };

  const adminResetMarket = async () => {
    if (!isAdmin) return;

    askConfirmation(
      'Reset Stock Market',
      'Do you want to reset the Stock Market? All prices will return to base value.',
      async () => {
        try {
          const marketRef = ref(rtdb, 'market');
          const initialMarket: Record<string, any> = {};
          Object.entries(currentCommodities).forEach(([id, data]: [string, any]) => {
            initialMarket[id] = {
              itemId: id,
              name: data.name,
              currentPrice: data.basePrice || data.price || 10,
              basePrice: data.basePrice || data.price || 10,
              volume6h: 0,
              trend: 'stable'
            };
          });
          await set(marketRef, initialMarket);
          addNotification('Stock Market reset!', 'success');
        } catch (err) {
          console.error('Reset market failed:', err);
          addNotification('Error resetting market.', 'error');
        }
      }
    );
  };

  const adminResetAllAccounts = async () => {
    if (!isAdmin) return;

    askConfirmation(
      'TOTAL ACCOUNT RESET',
      'ATTENTION: IRREVERSIBLE ACTION! This will reset ALL accounts for ALL users (Balance, Inventory, Farm, Level). Do you want to continue?',
      () => {
        askConfirmation(
          'LAST WARNING',
          'All player progress data will be permanently deleted. Confirm total reset?',
          async () => {
            try {
              // 1. Reset RTDB paths
              const rtdbUpdates: Record<string, any> = {};
              rtdbUpdates['inventory'] = null;
              rtdbUpdates['farmSlots'] = null;
              rtdbUpdates['transactions'] = null;
              rtdbUpdates['withdrawalRequests'] = null;
              rtdbUpdates['marketListings'] = null;
              rtdbUpdates['productions'] = null;
              rtdbUpdates['users'] = null; // This resets water, profile info, etc.
              
              // Keep system financials or reset them? User asked for both, so let's reset them too.
              rtdbUpdates['globalConfig/system'] = { playerDepositsMinusWithdrawals: 0, marketProfit: 0 };

              await update(ref(rtdb), rtdbUpdates);

              // 2. Reset Firestore users
              const usersSnap = await getDocs(collection(db, 'users'));
              const batch = [];
              
              for (const userDoc of usersSnap.docs) {
                const userData = userDoc.data();
                // Reset user data but keep UID and Role (especially for admin)
                const resetData = {
                  ...userData,
                  balanceKZ: gameConfig?.data?.startingBalance ?? 1000,
                  xp: 0,
                  level: 1,
                  lastLogin: new Date().toISOString()
                };
                batch.push(setDoc(doc(db, 'users', userDoc.id), resetData));
              }

              await Promise.all(batch);
              
              addNotification('ALL accounts have been reset successfully!', 'success');
              // Force reload to ensure fresh state
              window.location.reload();
            } catch (err) {
              console.error('Reset all accounts failed:', err);
              addNotification('Error resetting accounts.', 'error');
            }
          }
        );
      }
    );
  };

  const adminGiveBalanceToUser = async (userId: string, amount: number) => {
    if (!isAdmin) return;
    update(ref(rtdb), { [`users/${userId}/balanceKZ`]: rtdbIncrement(amount) }).then(() => {
      setAdminActionUser(null);
    }).catch(err => console.error('Admin give balance failed:', err));
  };

  const adminSearchUsers = async () => {
    if (!isAdmin) return;
    const usersRef = ref(rtdb, 'users');
    const snap = await get(usersRef);
    if (snap.exists()) {
      const allUsers = Object.values(snap.val());
      const filtered = allUsers.filter((u: any) => 
        u.name.toLowerCase().includes(adminSearchUser.toLowerCase()) ||
        u.email.toLowerCase().includes(adminSearchUser.toLowerCase()) ||
        u.uid.toLowerCase().includes(adminSearchUser.toLowerCase())
      );
      setAdminUsers(filtered);
    }
  };

  const adminBanUser = async (userId: string, banned: boolean) => {
    if (!isAdmin) return;
    update(ref(rtdb, `users/${userId}`), { banned }).then(() => {
      adminSearchUsers();
    });
  };

  const adminUpdateWeather = async (newWeather: WeatherType) => {
    if (!isAdmin) return;
    set(ref(rtdb, 'globalConfig/weather'), newWeather)
      .then(() => addNotification(`Weather changed to ${weatherEffects[newWeather].name}!`, 'success'))
      .catch(err => console.error('Update weather failed:', err));
  };

  const adminUpdateWeatherEffect = async (id: WeatherType, data: any) => {
    if (!isAdmin) return;
    update(ref(rtdb, `globalConfig/weatherEffects/${id}`), data).then(() => {
      setAdminEditingWeatherEffect(null);
      addNotification(`Buffs de ${weatherEffects[id].name} atualizados!`, 'success');
    }).catch(err => console.error('Update weather effect failed:', err));
  };

  const adminScheduleEvent = async (eventData: Omit<GameEvent, 'id'>) => {
    if (!isAdmin) return;
    const eventRef = push(ref(rtdb, 'globalConfig/scheduledEvents'));
    const newEvent = { ...eventData, id: eventRef.key };
    set(eventRef, newEvent)
      .then(() => addNotification('Event scheduled successfully!', 'success'))
      .catch(err => console.error('Schedule event failed:', err));
  };

  const adminDeleteEvent = async (eventId: string) => {
    if (!isAdmin) return;
    remove(ref(rtdb, `globalConfig/scheduledEvents/${eventId}`))
      .then(() => addNotification('Event removed!', 'success'))
      .catch(err => console.error('Delete event failed:', err));
  };

  const adminAddSystemBank = async (amount: number) => {
    if (!isAdmin) return;
    update(ref(rtdb, 'globalConfig/system'), {
      playerDepositsMinusWithdrawals: (systemFinancials.playerDepositsMinusWithdrawals || 0) + amount
    }).catch(err => console.error('Failed to add bank:', err));
  };

  const adminUpdateLevel = async (level: number, data: any) => {
    if (!isAdmin) return;
    update(ref(rtdb, `globalConfig/game/levels/${level}`), data).then(() => {
      setAdminEditingLevel(null);
    }).catch(err => console.error('Failed to update level:', err));
  };

  const adminAddLevel = async (data: any) => {
    if (!isAdmin) return;
    update(ref(rtdb, `globalConfig/game/levels/${data.level}`), data).then(() => {
      setAdminEditingLevel(null);
    }).catch(err => console.error('Failed to add level:', err));
  };

  const adminDeleteLevel = async (level: number) => {
    if (!isAdmin) return;
    remove(ref(rtdb, `globalConfig/game/levels/${level}`)).catch(err => console.error('Failed to delete level:', err));
  };



  const deliverMissionItems = useCallback(async (missionId: string) => {
    if (!user) return;
    const mission = missions.find(m => m.id === missionId);
    if (!mission || mission.type !== 'delivery') return;

    const progress = { ...(userMissionProgress[missionId] || { currentQuantity: 0, completed: false, claimed: false, lastReset: Date.now() }) };
    
    // Check reset (daily/weekly)
    const now = Date.now();
    const resetTime = mission.period === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    if (now - progress.lastReset > resetTime) {
      progress.currentQuantity = 0;
      progress.completed = false;
      progress.claimed = false;
      progress.lastReset = now;
    }

    // Double check if already completed after reset check
    if (progress.completed || progress.currentQuantity >= mission.targetQuantity) {
      if (!progress.completed) {
        // If it was somehow completed but not marked, mark it now
        const updates: Record<string, any> = {};
        updates[`users/${user.uid}/missionProgress/${missionId}/completed`] = true;
        update(ref(rtdb), updates);
      }
      return;
    }

    const targetItemId = mission.targetItemId;
    if (!targetItemId) return;

    const currentInventoryQty = inventory[targetItemId] || 0;
    const needed = Math.max(0, mission.targetQuantity - progress.currentQuantity);
    const toDeliver = Math.min(currentInventoryQty, needed);

    if (toDeliver <= 0) {
      if (currentInventoryQty <= 0) {
        addNotification(`Você não tem ${currentCommodities[targetItemId]?.name || targetItemId} para entregar!`, 'error');
      } else {
        addNotification('Esta missão já está com a entrega completa!', 'success');
      }
      return;
    }

    const updates: Record<string, any> = {};

    // Subtract from inventory
    updates[`inventory/${user.uid}/${targetItemId}`] = rtdbIncrement(-toDeliver);

    // Update progress
    const newQuantity = progress.currentQuantity + toDeliver;
    const isCompleted = newQuantity >= mission.targetQuantity;

    const newProgress = {
      ...progress,
      currentQuantity: newQuantity,
      completed: isCompleted,
      lastReset: progress.lastReset || now
    };

    updates[`users/${user.uid}/missionProgress/${missionId}`] = newProgress;

    if (isCompleted) {
      addNotification(`Delivery Mission Completed: ${mission.title}!`, 'success');
    } else {
      addNotification(`Delivered ${toDeliver}x ${currentCommodities[targetItemId]?.name || targetItemId}.`);
    }

    update(ref(rtdb), updates).catch(err => {
      console.error('Failed to deliver mission items:', err);
      addNotification('Error delivering items.', 'error');
    });
  }, [user, missions, userMissionProgress, inventory, currentCommodities]);

  const claimMissionReward = async (missionId: string) => {
    const mission = missions.find(m => m.id === missionId);
    const progress = userMissionProgress[missionId];

    if (!mission || !progress || !progress.completed || progress.claimed) return;

    const updates: Record<string, any> = {};
    
    // Reward KZ
    if (mission.rewardKZ > 0) {
      updates[`users/${user.uid}/balanceKZ`] = rtdbIncrement(mission.rewardKZ);
      
      const transRef = push(ref(rtdb, `transactions/${user.uid}`));
      updates[`transactions/${user.uid}/${transRef.key}`] = {
        id: transRef.key,
        userId: user.uid,
        type: 'deposit',
        amountKZ: mission.rewardKZ,
        itemId: 'mission_reward',
        timestamp: Date.now(),
        status: 'completed'
      };
    }

    // Reward Item
    if (mission.rewardItemId && mission.rewardItemQuantity > 0) {
      updates[`inventory/${user.uid}/${mission.rewardItemId}`] = rtdbIncrement(mission.rewardItemQuantity);
    }

    updates[`users/${user.uid}/missionProgress/${missionId}/claimed`] = true;

    update(ref(rtdb), updates)
      .then(() => addNotification(`Reward for mission ${mission.title} claimed!`, 'success'))
      .catch(err => console.error('Failed to claim mission reward:', err));
  };

  const adminAddMission = async (missionId: string, data: any) => {
    if (!isAdmin) return;
    const finalId = missionId || Date.now().toString();
    const finalData = { ...data, id: finalId };
    update(ref(rtdb, `globalConfig/game/data/missions/${finalId}`), finalData).then(() => {
      setAdminEditingMission(null);
      addNotification('Mission saved successfully!', 'success');
    }).catch(err => console.error('Admin add mission failed:', err));
  };

  const adminDeleteMission = async (missionId: string) => {
    if (!isAdmin) return;
    remove(ref(rtdb, `globalConfig/game/data/missions/${missionId}`)).then(() => {
      addNotification('Mission removed!', 'success');
    }).catch(err => console.error('Admin delete mission failed:', err));
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-stone-100 p-4">
      <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="mt-4 text-stone-600 font-medium">Loading Farm...</p>
    </div>
  );

  // Banned check
  if (profile?.banned) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-stone-100 p-8 text-center">
        <div className="bg-rose-100 p-6 rounded-full mb-6">
          <ShieldAlert className="w-12 h-12 text-rose-600" />
        </div>
        <h1 className="text-2xl font-serif italic font-bold text-stone-900 mb-2">Access Suspended</h1>
        <p className="text-stone-600 max-w-xs mx-auto mb-8">
          Your account has been suspended for violating the Fazenda Kwanza system terms of service.
        </p>
        <button 
          onClick={() => signOut(auth)}
          className="px-8 py-3 bg-stone-900 text-white rounded-2xl font-bold shadow-lg hover:bg-stone-800 transition-all"
        >
          Logout
        </button>
      </div>
    );
  }

  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-stone-100 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-6 max-w-md"
      >
        <div className="bg-emerald-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-xl">
          <Sprout className="text-white w-12 h-12" />
        </div>
        <h1 className="text-4xl font-bold text-stone-900 font-serif italic">Fazenda Kwanza</h1>
        <p className="text-stone-600">Manage your land, plant the future and dominate the Angolan agricultural commodity market.</p>
        <button 
          onClick={handleLogin}
          className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
        >
          Login with Google
        </button>
      </motion.div>
    </div>
  );

  if (!profile) return (
    <div className="h-screen flex flex-col items-center justify-center bg-stone-100 p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center space-y-4"
      >
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <h2 className="text-xl font-bold text-stone-800">Synchronizing your farm...</h2>
        <p className="text-stone-500 text-sm max-w-xs mx-auto">
          If this takes too long, check your connection or if the database permissions are correct.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="text-emerald-600 font-bold text-sm underline"
        >
          Reload page
        </button>
        <button 
          onClick={() => signOut(auth)}
          className="block mx-auto text-stone-400 text-xs mt-8"
        >
          Logout
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans pb-24">
      {/* HUD */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20 p-2 sm:p-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="flex items-center justify-between w-full sm:w-auto gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-xl">
                <Sprout className="text-emerald-700 w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h2 className="font-bold text-xs sm:text-sm leading-none truncate max-w-[120px] sm:max-w-none">{profile?.name}</h2>
                <p className="text-[9px] sm:text-[10px] text-stone-500 uppercase tracking-widest mt-1">Nível {profile?.level} · {profile?.xp} XP</p>
              </div>
            </div>
            
            {/* Mobile Water and Balance */}
            <div className="flex sm:hidden items-center gap-2">
              <div className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg flex items-center gap-1 border border-blue-100">
                <Droplets className="w-3 h-3" />
                <span className="font-mono font-bold text-xs">{water?.balance || 0}</span>
              </div>
              <div className="bg-stone-900 text-white px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                <Wallet className="w-3 h-3 text-emerald-400" />
                <span className="font-mono font-bold text-xs">{(profile?.balanceKZ || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between w-full sm:w-auto gap-2 sm:gap-4">
            <div className="hidden sm:flex bg-blue-50 text-blue-700 px-4 py-2 rounded-2xl items-center gap-2 border border-blue-100">
              <Droplets className="w-4 h-4" />
              <span className="font-mono font-bold">{water?.balance || 0}</span>
            </div>
            <div className="hidden sm:flex bg-stone-900 text-white px-4 py-2 rounded-2xl items-center gap-2 shadow-lg">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span className="font-mono font-bold">{profile?.balanceKZ?.toLocaleString()} <span className="text-[10px] opacity-60">KZ</span></span>
            </div>
            
            <div className="flex items-center justify-center w-full sm:w-auto gap-1 sm:gap-2">
              <button 
                onClick={() => setShowProfileModal(true)}
                className="flex-1 sm:flex-none p-2 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-colors flex justify-center"
                title="Editar Perfil"
              >
                <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button 
                onClick={() => setShowDeposit(true)}
                className="flex-1 sm:flex-none p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex justify-center"
                title="Depositar"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button 
                onClick={() => setShowWithdraw(true)}
                className="flex-1 sm:flex-none p-2 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-colors flex justify-center"
                title="Sacar"
              >
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button 
                onClick={() => signOut(auth)}
                className="flex-1 sm:flex-none p-2 bg-rose-100 text-rose-600 rounded-xl hover:bg-rose-200 transition-colors flex justify-center"
                title="Sair"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Weather and Events Banner */}
        <div className="space-y-4">
          <div className={`bg-gradient-to-r ${weather === 'stormy' ? 'from-slate-100 to-slate-200 border-slate-300' : 'from-amber-50 to-orange-50 border-amber-200'} border rounded-3xl p-4 flex items-center justify-between`}>
            <div className="flex items-center gap-4">
              <div className="bg-white/50 backdrop-blur-sm p-3 rounded-2xl text-3xl">
                {weatherEffects[weather]?.icon}
              </div>
              <div>
                <h3 className={`font-bold font-serif italic ${weather === 'stormy' ? 'text-slate-900' : 'text-amber-900'}`}>
                  Clima: {weatherEffects[weather]?.name}
                </h3>
                <p className={`text-sm ${weather === 'stormy' ? 'text-slate-700' : 'text-amber-800/70'}`}>
                  {weatherEffects[weather]?.description}
                </p>
              </div>
            </div>
          </div>

          {activeEvents.length > 0 && (
            <div className="bg-stone-900 text-white rounded-3xl p-4 flex items-center gap-4 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-2 opacity-10">
                <Sparkles className="w-20 h-20" />
              </div>
              <div className="bg-white/10 p-3 rounded-2xl text-2xl">
                {activeEvents[0].icon}
              </div>
              <div className="relative z-10">
                <h3 className="font-bold font-serif italic text-amber-400 flex items-center gap-2">
                  Evento Ativo: {activeEvents[0].name}
                  <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                </h3>
                <p className="text-sm text-stone-300">
                  {activeEvents[0].description}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex bg-white p-1 rounded-2xl border border-stone-200 overflow-x-auto no-scrollbar">
          {[
            { id: 'farm', icon: Sprout, label: 'Fazenda' },
            { id: 'water', icon: Droplets, label: 'Água' },
            { id: 'store', icon: Store, label: 'Loja' },
            { id: 'market', icon: TrendingUp, label: 'Bolsa' },
            { id: 'quests', icon: ClipboardList, label: 'Missões' },
            { id: 'history', icon: ArrowRightLeft, label: 'Histórico' },
            ...(isAdmin ? [{ id: 'sistema', icon: Settings, label: 'Sistema' }] : [])
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-w-[100px] py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                activeTab === tab.id ? 'bg-stone-900 text-white shadow-md' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-sm font-bold">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'farm' && (
            <motion.div 
              key="farm"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Farm Sub-tabs */}
              <div className="flex gap-2 p-1 bg-stone-100 rounded-2xl w-full overflow-x-auto no-scrollbar">
                <button 
                  onClick={() => setFarmSubTab('cultivation')}
                  className={`flex-1 min-w-[100px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${farmSubTab === 'cultivation' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                >
                  Cultivo
                </button>
                <button 
                  onClick={() => setFarmSubTab('corral')}
                  className={`flex-1 min-w-[100px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${farmSubTab === 'corral' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                >
                  Curral
                </button>
                <button 
                  onClick={() => setFarmSubTab('production')}
                  className={`flex-1 min-w-[100px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${farmSubTab === 'production' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                >
                  Produção
                </button>
                <button 
                  onClick={() => setFarmSubTab('warehouse')}
                  className={`flex-1 min-w-[100px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${farmSubTab === 'warehouse' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                >
                  Armazém
                </button>
              </div>

              <AnimatePresence mode="wait">
                {farmSubTab === 'cultivation' ? (
                  <motion.div
                    key="cultivation"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4"
                  >
                    {slots.filter(s => s.area === 'cultivo').map(slot => (
                      <FarmSlotCard 
                        key={slot.id} 
                        slot={slot} 
                        commodities={currentCommodities}
                        inventory={inventory}
                        onPlant={(itemId) => plantCrop(slot.id, itemId, Date.now())}
                        onHarvest={() => harvestCrop(slot.id)}
                        onFeed={(feedId) => feedAnimal(slot.id, feedId)}
                        onWater={() => waterCrop(slot.id)}
                      />
                    ))}
                    
                    {/* Buy Slot Button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => buySlot('cultivo')}
                      disabled={profile.balanceKZ < SLOT_PRICE}
                      className="aspect-square rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/30 flex flex-col items-center justify-center p-4 hover:bg-emerald-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-8 h-8 text-emerald-600 mb-2" />
                      <span className="text-[10px] font-bold text-emerald-700 uppercase leading-none">Novo Slot</span>
                      <span className="text-[8px] text-emerald-600/70 font-mono mt-1">{SLOT_PRICE.toLocaleString()} KZ</span>
                    </motion.button>
                  </motion.div>
                ) : farmSubTab === 'corral' ? (
                  <motion.div
                    key="corral"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4"
                  >
                    {slots.filter(s => s.area === 'curral').map(slot => (
                      <FarmSlotCard 
                        key={slot.id} 
                        slot={slot} 
                        commodities={currentCommodities}
                        inventory={inventory}
                        onPlant={(itemId) => plantCrop(slot.id, itemId, Date.now())}
                        onHarvest={() => harvestCrop(slot.id)}
                        onFeed={(feedId) => feedAnimal(slot.id, feedId)}
                        onWater={() => waterCrop(slot.id)}
                      />
                    ))}
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => buySlot('curral')}
                      disabled={profile.balanceKZ < SLOT_PRICE}
                      className="aspect-square rounded-3xl border-2 border-dashed border-blue-300 bg-blue-50/30 flex flex-col items-center justify-center p-4 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-8 h-8 text-blue-600 mb-2" />
                      <span className="text-[10px] font-bold text-blue-700 uppercase leading-none text-center">Novo Curral</span>
                      <span className="text-[8px] text-blue-600/70 font-mono mt-1">{SLOT_PRICE.toLocaleString()} KZ</span>
                    </motion.button>
                  </motion.div>
                ) : farmSubTab === 'production' ? (
                  <motion.div
                    key="production"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
                      <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                        <h3 className="font-serif italic font-bold">Área de Produção</h3>
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest">Transforme seus produtos em itens valiosos</p>
                      </div>
                      <div className="divide-y divide-stone-100">
                        {Object.values(currentRecipes).map((recipe: any) => {
                          const canProduce = recipe.inputs.every((input: any) => (inventory[input.itemId] || 0) >= input.quantity);
                          return (
                            <div key={recipe.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center shrink-0">
                                  {recipe.icon ? (
                                    <span className="text-2xl">{recipe.icon}</span>
                                  ) : (
                                    <Sparkles className="w-6 h-6 text-purple-600" />
                                  )}
                                </div>
                                <div>
                                  <h4 className="font-bold">{recipe.name}</h4>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {recipe.inputs.map((input: any) => (
                                      <span key={input.itemId} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                        (inventory[input.itemId] || 0) >= input.quantity ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'
                                      }`}>
                                        {input.quantity}x {(currentCommodities as any)[input.itemId]?.name || input.itemId}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right hidden sm:block">
                                  <p className="text-[10px] font-bold text-stone-400 uppercase">Duração</p>
                                  <p className="text-xs font-mono font-bold text-stone-600">{recipe.duration}s</p>
                                </div>
                                {gameConfig?.productionTaxKZ > 0 && (
                                  <div className="text-right hidden sm:block">
                                    <p className="text-[10px] font-bold text-stone-400 uppercase">Taxa</p>
                                    <p className="text-xs font-mono font-bold text-rose-600">{gameConfig.productionTaxKZ.toLocaleString()} KZ</p>
                                  </div>
                                )}
                                <button 
                                  onClick={() => produceItem(recipe.id)}
                                  disabled={!canProduce || !!productions[recipe.id] || (profile?.balanceKZ < (gameConfig?.productionTaxKZ || 0))}
                                  className="px-6 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-all disabled:opacity-20 relative overflow-hidden group min-w-[100px]"
                                >
                                  <span className="relative z-10">
                                    {productions[recipe.id] ? `${displayProgress[recipe.id]?.toFixed(0)}%` : 'Produzir'}
                                  </span>
                                  {productions[recipe.id] && (
                                    <motion.div 
                                      className="absolute inset-0 bg-purple-400 origin-left"
                                      initial={{ scaleX: 0 }}
                                      animate={{ scaleX: (displayProgress[recipe.id] || 0) / 100 }}
                                    />
                                  )}
                                  {!productions[recipe.id] && (
                                    <motion.div 
                                      className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
                                    />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="warehouse"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
                      <div className="divide-y divide-stone-100">
                        {Object.entries(inventory).filter(([_, qty]) => qty > 0).length === 0 ? (
                          <div className="p-8 text-center text-stone-400 text-sm">Seu armazém está vazio. Compre sementes na loja!</div>
                        ) : (
                          <>
                            {/* Sementes e Animais */}
                            {Object.entries(inventory).filter(([itemId, qty]) => qty > 0 && (currentCommodities[itemId]?.type === 'seed' || currentCommodities[itemId]?.type === 'animal')).length > 0 && (
                              <div className="bg-stone-50/50 px-4 py-2 border-b border-stone-100">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Sementes e Animais</span>
                              </div>
                            )}
                            {Object.entries(inventory).filter(([itemId, qty]) => qty > 0 && (currentCommodities[itemId]?.type === 'seed' || currentCommodities[itemId]?.type === 'animal')).map(([itemId, qty]) => {
                              const itemInfo = (currentCommodities as any)[itemId];
                              return (
                               <motion.div 
                                 key={itemId} 
                                 whileHover={{ scale: 1.02 }}
                                 className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors"
                               >
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0">
                                      {itemInfo?.icon ? (
                                        <span className="text-2xl">{itemInfo.icon}</span>
                                      ) : itemInfo.type === 'animal' ? (
                                        <Users className="w-6 h-6 text-amber-600" />
                                      ) : (
                                        <Sprout className="w-6 h-6 text-amber-600" />
                                      )}
                                    </div>
                                    <div>
                                      <h4 className="font-bold">{itemInfo?.name}</h4>
                                      <p className="text-xs text-stone-500">{qty} unidades em estoque</p>
                                    </div>
                                  </div>
                                  <div className="text-[10px] font-bold text-stone-400 uppercase">Pronto para usar</div>
                                </motion.div>
                              );
                            })}

                            {/* Produtos Colhidos */}
                            {Object.entries(inventory).filter(([itemId, qty]) => qty > 0 && currentCommodities[itemId]?.type !== 'seed' && currentCommodities[itemId]?.type !== 'animal').length > 0 && (
                              <div className="bg-stone-50/50 px-4 py-2 border-b border-stone-100 border-t">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Produtos Colhidos</span>
                              </div>
                            )}
                            {Object.entries(inventory).filter(([itemId, qty]) => qty > 0 && currentCommodities[itemId]?.type !== 'seed' && currentCommodities[itemId]?.type !== 'animal').map(([itemId, qty]) => {
                              const itemInfo = (currentCommodities as any)[itemId];
                              const marketPrice = market.find(m => m.itemId === itemId)?.currentPrice || itemInfo?.basePrice || 0;
                              
                              return (
                                <div key={itemId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50 transition-colors">
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center shrink-0">
                                      {itemInfo?.icon ? (
                                        <span className="text-2xl">{itemInfo.icon}</span>
                                      ) : (
                                        <Package className="w-6 h-6 text-emerald-600" />
                                      )}
                                    </div>
                                    <div>
                                      <h4 className="font-bold">{itemInfo?.name}</h4>
                                      <p className="text-xs text-stone-500">{qty} unidades em estoque</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => sellItem(itemId, Date.now())}
                                      className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] sm:text-xs font-bold hover:bg-emerald-700 transition-all"
                                    >
                                      Venda Direta ({marketPrice.toFixed(0)} KZ)
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setListingItem({ id: itemId, name: itemInfo.name, price: marketPrice });
                                        setListingPrice(Math.round(marketPrice));
                                        setListingQty(1);
                                      }}
                                      className="flex-1 sm:flex-none px-4 py-2 bg-stone-900 text-white rounded-xl text-[10px] sm:text-xs font-bold hover:bg-stone-800 transition-all"
                                    >
                                      Mercado
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
          {activeTab === 'water' && (
            <motion.div 
              key="water"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <WaterMiniGame user={user} currentWater={water?.balance || 0} />
            </motion.div>
          )}

          {activeTab === 'store' && (
            <motion.div 
              key="store"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-stone-900 rounded-3xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <Store className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-xl font-serif italic font-bold">System Store</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(currentCommodities).filter(([_, data]: [string, any]) => data.type === 'seed' || data.type === 'animal').map(([id, data]: [string, any]) => {
                    const price = data.price;
                    return (
                      <motion.div 
                        key={id} 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                            {data.icon ? (
                              <span className="text-xl">{data.icon}</span>
                            ) : data.type === 'animal' ? (
                              <Users className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <PlusCircle className="w-5 h-5 text-emerald-400" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm">{data.name}</h4>
                            <p className="text-[10px] text-stone-400 uppercase tracking-widest">Price: {price} KZ</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => buySeed(id, Date.now())}
                          disabled={profile.balanceKZ < price}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-bold hover:bg-emerald-500 transition-all disabled:opacity-20"
                        >
                          Buy
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'market' && (
            <motion.div 
              key="market"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* P2P Market */}
              <div className="bg-stone-900 rounded-3xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <Store className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-xl font-serif italic font-bold">Player Market</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {marketListings.filter(l => l.sellerId !== user.uid).length === 0 ? (
                    <div className="col-span-2 py-8 text-center text-stone-500 text-sm bg-black/20 rounded-2xl border border-white/5">
                      No items available in the P2P market at the moment.
                    </div>
                  ) : (
                    marketListings.filter(l => l.sellerId !== user.uid).map(listing => (
                      <div key={listing.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                            {((currentCommodities as any)[listing.itemId])?.icon ? (
                              <span className="text-xl">{((currentCommodities as any)[listing.itemId]).icon}</span>
                            ) : (
                              <Package className="w-5 h-5 text-emerald-400" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm">{(currentCommodities as any)[listing.itemId]?.name}</h4>
                            <p className="text-[10px] text-stone-400">Seller: {listing.sellerName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-emerald-400">{(listing.pricePerUnit * listing.quantity).toLocaleString()} KZ</div>
                          <button 
                            onClick={() => buyFromMarket(listing, Date.now())}
                            disabled={profile.balanceKZ < (listing.pricePerUnit * listing.quantity)}
                            className="mt-2 px-3 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-500 transition-all disabled:opacity-20"
                          >
                            Buy
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* System Market (Bolsa) */}
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
                  <h3 className="font-serif italic font-bold">Stock Market</h3>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <button 
                        onClick={adminResetMarket}
                        className="p-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
                        title="Resetar Bolsa"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-[10px] uppercase tracking-widest text-stone-400">Price Reference</span>
                  </div>
                </div>
                <div className="p-4 bg-stone-50/50 border-b border-stone-100 flex gap-2 overflow-x-auto no-scrollbar">
                  {['all', 'agricola', 'pecuaria', 'industrial'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setMarketCategoryFilter(cat)}
                      className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                        marketCategoryFilter === cat 
                          ? 'bg-stone-900 text-white shadow-md' 
                          : 'bg-white text-stone-400 border border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      {cat === 'all' ? 'Todos' : cat === 'agricola' ? 'Agrícola' : cat === 'pecuaria' ? 'Pecuária' : 'Industrial'}
                    </button>
                  ))}
                </div>
                <div className="divide-y divide-stone-100">
                  {Object.entries(currentCommodities)
                    .filter(([itemId, commodity]: [string, any]) => {
                      if (!commodity || commodity.category === 'semente' || commodity.category === 'animal') return false;
                      if (marketCategoryFilter !== 'all' && commodity.category !== marketCategoryFilter) return false;
                      return true;
                    })
                    .map(([itemId, commodity]: [string, any]) => {
                      const marketData = market.find(m => m.itemId === itemId);
                      const item = {
                        itemId,
                        name: commodity.name,
                        currentPrice: marketData?.currentPrice || commodity.basePrice,
                        basePrice: marketData?.basePrice || commodity.basePrice,
                        volume6h: marketData?.volume6h || 0,
                        trend: marketData?.trend || 'stable'
                      };
                      return (
                        <div 
                          key={item.itemId} 
                          onClick={() => setSelectedMarketItem(item)}
                          className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                              {((currentCommodities as any)[item.itemId])?.icon ? (
                                <span className="text-xl">{((currentCommodities as any)[item.itemId]).icon}</span>
                              ) : (
                                <Package className="w-5 h-5 text-stone-400" />
                              )}
                            </div>
                            <div>
                              <h4 className="font-bold">{item.name}</h4>
                              <p className="text-[10px] text-stone-400 uppercase tracking-tighter">Vol. 6h: {item.volume6h}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-lg">{item.currentPrice.toFixed(2)} <span className="text-xs">KZ</span></div>
                            <div className={`flex items-center justify-end gap-1 text-[10px] font-bold ${item.currentPrice >= item.basePrice ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {item.currentPrice >= item.basePrice ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {Math.abs(((item.currentPrice - item.basePrice) / item.basePrice) * 100).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'quests' && (
            <motion.div 
              key="quests"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-serif italic font-bold text-stone-800">Missions and Objectives</h2>
                <div className="flex gap-2">
                  <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-amber-200">
                    Daily
                  </div>
                  <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-blue-200">
                    Weekly
                  </div>
                </div>
              </div>

              {missions.length === 0 ? (
                <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center space-y-4">
                  <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto">
                    <ClipboardList className="w-8 h-8 text-stone-300" />
                  </div>
                  <h3 className="font-serif italic text-xl font-bold">No missions available</h3>
                  <p className="text-stone-500 text-sm max-w-xs mx-auto">The city council hasn't published new requests yet. Come back later!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {missions.map(mission => {
                    const rawProgress = userMissionProgress[mission.id] || { currentQuantity: 0, completed: false, claimed: false, lastReset: Date.now() };
                    
                    // Client-side reset check for UI consistency
                    const now = Date.now();
                    const resetTime = mission.period === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
                    const isReset = now - rawProgress.lastReset > resetTime;
                    
                    const progress = isReset ? { currentQuantity: 0, completed: false, claimed: false, lastReset: now } : rawProgress;
                    const percent = Math.min(100, (progress.currentQuantity / mission.targetQuantity) * 100);
                    const targetItem = (currentCommodities as any)[mission.targetItemId];
                    const rewardItem = (currentCommodities as any)[mission.rewardItemId];

                    return (
                      <motion.div 
                        key={mission.id}
                        whileHover={{ y: -2 }}
                        className={`bg-white rounded-3xl border ${progress.completed ? 'border-emerald-200 bg-emerald-50/10' : 'border-stone-200'} p-5 space-y-4 relative overflow-hidden`}
                      >
                        {progress.claimed && (
                          <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-bold uppercase rounded-full">
                            Resgatado
                          </div>
                        )}
                        
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${mission.period === 'daily' ? 'bg-amber-100' : 'bg-blue-100'}`}>
                              {mission.icon || '📜'}
                            </div>
                            <div>
                              <h4 className="font-bold text-stone-800">{mission.title}</h4>
                              <p className="text-xs text-stone-500">{mission.description}</p>
                            </div>
                          </div>
                          <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg ${mission.period === 'daily' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                            {mission.period === 'daily' ? 'Day' : 'Week'}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold uppercase text-stone-400">
                            <span>Progresso</span>
                            <span>{progress.currentQuantity} / {mission.targetQuantity}</span>
                          </div>
                          <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percent}%` }}
                              className={`h-full ${progress.completed ? 'bg-emerald-500' : mission.period === 'daily' ? 'bg-amber-500' : 'bg-blue-500'}`}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold uppercase text-stone-400">Reward:</span>
                            <div className="flex items-center gap-2">
                              {mission.rewardKZ > 0 && (
                                <div className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-xs font-bold">
                                  <Coins className="w-3 h-3" />
                                  {mission.rewardKZ}
                                </div>
                              )}
                              {rewardItem && (
                                <div className="flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-1 rounded-lg text-xs font-bold">
                                  <span className="text-sm">{rewardItem.icon || '📦'}</span>
                                  {mission.rewardItemQuantity}
                                </div>
                              )}
                            </div>
                          </div>

                          {progress.completed && !progress.claimed ? (
                            <button
                              onClick={() => claimMissionReward(mission.id)}
                              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 animate-pulse"
                            >
                              Resgatar
                            </button>
                          ) : progress.completed && progress.claimed ? (
                            <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
                              <Check className="w-4 h-4" /> Completed
                            </div>
                          ) : mission.type === 'delivery' ? (
                            <div className="flex items-center gap-2">
                              <div className="text-[10px] font-bold text-stone-400 uppercase">
                                In Warehouse: <span className={inventory[mission.targetItemId] > 0 ? 'text-emerald-600' : 'text-rose-500'}>{inventory[mission.targetItemId] || 0}</span>
                              </div>
                              <button
                                onClick={() => deliverMissionItems(mission.id)}
                                disabled={!inventory[mission.targetItemId] || inventory[mission.targetItemId] <= 0}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                  inventory[mission.targetItemId] > 0 
                                    ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-200' 
                                    : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                                }`}
                              >
                                Deliver
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] font-bold text-stone-400 uppercase">
                              Em andamento
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
                  <h3 className="font-serif italic font-bold">Transaction History</h3>
                  <span className="text-[10px] uppercase tracking-widest text-stone-400">Last 50 operations</span>
                </div>
                <div className="divide-y divide-stone-100 max-h-[60vh] overflow-y-auto">
                  {transactions.length === 0 ? (
                    <div className="p-8 text-center text-stone-400 text-sm">No transactions recorded.</div>
                  ) : (
                    transactions.map(t => (
                      <div key={t.id} className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            t.type === 'purchase' || t.type === 'p2p_buy' ? 'bg-amber-100 text-amber-600' :
                            t.type === 'sale' || t.type === 'p2p_sell' ? 'bg-emerald-100 text-emerald-600' :
                            t.type === 'deposit' ? 'bg-blue-100 text-blue-600' :
                            t.type === 'listing' ? 'bg-stone-100 text-stone-600' :
                            'bg-rose-100 text-rose-600'
                          }`}>
                            {t.itemId && (currentCommodities as any)[t.itemId]?.icon ? (
                              <span className="text-xl">{(currentCommodities as any)[t.itemId].icon}</span>
                            ) : t.type === 'purchase' || t.type === 'p2p_buy' ? <Package className="w-5 h-5" /> :
                             t.type === 'sale' || t.type === 'p2p_sell' ? <TrendingUp className="w-5 h-5" /> :
                             t.type === 'deposit' ? <Plus className="w-5 h-5" /> :
                             t.type === 'listing' ? <ClipboardList className="w-5 h-5" /> :
                             <CreditCard className="w-5 h-5" />}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm">
                              {(t.type === 'purchase' || t.type === 'p2p_buy') ? `Compra: ${currentCommodities[t.itemId as keyof typeof currentCommodities]?.name || t.itemId}` :
                               (t.type === 'sale' || t.type === 'p2p_sell') ? `Venda: ${currentCommodities[t.itemId as keyof typeof currentCommodities]?.name || t.itemId}` :
                               t.type === 'deposit' ? 'Depósito Realizado' :
                               t.type === 'listing' ? `Item Listado: ${currentCommodities[t.itemId as keyof typeof currentCommodities]?.name || t.itemId}` :
                               'Saque Realizado'}
                            </h4>
                            <p className="text-[10px] text-stone-400 uppercase tracking-tighter">
                              {new Date(t.timestamp).toLocaleString('pt-AO')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono font-bold ${
                            t.type === 'sale' || t.type === 'deposit' || t.type === 'p2p_sell' ? 'text-emerald-600' : 
                            t.type === 'listing' ? 'text-stone-400' : 'text-rose-600'
                          }`}>
                            {t.type === 'sale' || t.type === 'deposit' || t.type === 'p2p_sell' ? '+' : 
                             t.type === 'listing' ? '' : '-'}{t.amountKZ.toLocaleString()} KZ
                          </div>
                          <div className="text-[8px] text-stone-400 uppercase">{t.status}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'sistema' && isAdmin && (
            <motion.div 
              key="sistema"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-3xl flex items-center gap-4">
                <div className="bg-rose-600 p-3 rounded-2xl shadow-lg">
                  <ShieldAlert className="text-white w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-rose-900">Administration Panel</h3>
                  <p className="text-xs text-rose-800/70">Restricted access for managing the Fazenda Kwanza ecosystem.</p>
                </div>
              </div>

              {/* Admin Sub-tabs */}
              <div className="flex gap-2 p-1 bg-stone-100 rounded-2xl w-full overflow-x-auto no-scrollbar">
                {[
                  { id: 'financials', label: 'Financials' },
                  { id: 'weather', label: 'Weather/Events' },
                  { id: 'missions', label: 'Missions' },
                  { id: 'commodities', label: 'Items' },
                  { id: 'recipes', label: 'Recipes' },
                  { id: 'levels', label: 'Levels' },
                  { id: 'users', label: 'Users' },
                  { id: 'deposits', label: 'Deposits' },
                  { id: 'withdrawals', label: 'Withdrawals' },
                  { id: 'settings', label: 'Config' }
                ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setAdminTab(tab.id as any)}
                    className={`flex-1 min-w-[100px] px-4 py-2 rounded-xl text-xs font-bold transition-all ${adminTab === tab.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* System Financials */}
              {adminTab === 'financials' && (
              <div className="bg-stone-900 rounded-3xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <Wallet className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-xl font-serif italic font-bold">System Financials</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <p className="text-[10px] uppercase font-bold text-stone-400 tracking-widest mb-1">Banca do Sistema</p>
                    <p className="text-2xl font-mono font-bold text-emerald-400">{(systemFinancials.playerDepositsMinusWithdrawals || 0).toLocaleString()} KZ</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <p className="text-[10px] uppercase font-bold text-stone-400 tracking-widest mb-1">Lucro do Mercado</p>
                    <p className="text-2xl font-mono font-bold text-amber-400">{(systemFinancials.marketProfit || 0).toLocaleString()} KZ</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Inject Funds into System</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[10000, 50000, 100000, 500000].map(amt => (
                      <button 
                        key={amt}
                        onClick={() => adminAddSystemBank(amt)}
                        className="py-2 bg-white/10 hover:bg-emerald-600 rounded-xl text-[10px] font-bold transition-all"
                      >
                        +{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <button 
                      onClick={adminResetFinancials}
                      className="w-full py-3 bg-rose-600/20 text-rose-400 border border-rose-600/30 rounded-xl text-xs font-bold hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> Resetar Sistema Financeiro
                    </button>
                  </div>
                </div>
              </div>
              )}

              {/* Weather and Events Management */}
              {adminTab === 'weather' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
                  <h3 className="font-serif italic font-bold flex items-center gap-2">
                    <Sun className="w-5 h-5 text-amber-500" /> Weather and Events
                  </h3>
                </div>
                <div className="p-6 space-y-8">
                  {/* Weather Control */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-3 tracking-widest">Weather and Buff Control</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.values(weatherEffects).map(w => (
                        <div 
                          key={w.id}
                          className={`p-4 rounded-3xl border transition-all flex flex-col gap-3 ${
                            weather === w.id 
                              ? 'bg-amber-50 border-amber-200 shadow-sm' 
                              : 'bg-white border-stone-100'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{w.icon}</span>
                              <span className="font-bold text-sm text-stone-900">{w.name}</span>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => adminUpdateWeather(w.id)}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                  weather === w.id 
                                    ? 'bg-amber-500 text-white' 
                                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                                }`}
                              >
                                {weather === w.id ? 'Ativo' : 'Ativar'}
                              </button>
                              <button
                                onClick={() => setAdminEditingWeatherEffect(w)}
                                className="p-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-all"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/50 p-2 rounded-xl border border-stone-100/50">
                              <p className="text-[8px] uppercase font-bold text-stone-400 mb-0.5">Growth</p>
                              <p className="text-xs font-mono font-bold text-stone-900">{w.growthMultiplier}x</p>
                            </div>
                            <div className="bg-white/50 p-2 rounded-xl border border-stone-100/50">
                              <p className="text-[8px] uppercase font-bold text-stone-400 mb-0.5">Yield</p>
                              <p className="text-xs font-mono font-bold text-stone-900">{w.yieldMultiplier}x</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-stone-500 italic line-clamp-1">{w.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scheduled Events */}
                  <div className="pt-6 border-t border-stone-100">
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-[10px] font-bold uppercase text-stone-400 block tracking-widest">Scheduled Events</label>
                      <button 
                        onClick={() => setShowEventModal(true)}
                        className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-[10px] font-bold hover:bg-stone-800 transition-all flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Schedule Event
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {scheduledEvents.length === 0 ? (
                        <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-stone-400 text-xs">
                          No events scheduled.
                        </div>
                      ) : (
                        scheduledEvents.map(event => {
                          const now = Date.now();
                          const isActive = now >= event.startTime && now <= event.endTime;
                          const isPast = now > event.endTime;
                          
                          return (
                            <div 
                              key={event.id} 
                              className={`p-4 rounded-2xl border flex items-center justify-between ${
                                isActive ? 'bg-amber-50 border-amber-200' : isPast ? 'bg-stone-50 border-stone-100 opacity-50' : 'bg-white border-stone-100'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{event.icon}</span>
                                <div>
                                  <h4 className="font-bold text-sm flex items-center gap-2">
                                    {event.name}
                                    {isActive && <span className="px-2 py-0.5 bg-amber-500 text-white text-[8px] rounded-full uppercase">Ativo</span>}
                                  </h4>
                                  <p className="text-[10px] text-stone-500">
                                    {new Date(event.startTime).toLocaleString()} - {new Date(event.endTime).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              <button 
                                onClick={() => adminDeleteEvent(event.id)}
                                className="p-2 text-stone-400 hover:text-rose-600 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* Game Configuration */}
              {adminTab === 'missions' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
                  <h3 className="font-serif italic font-bold flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-blue-500" /> Gerenciar Missões
                  </h3>
                  <button 
                    onClick={() => setAdminEditingMission({
                      isNew: true,
                      title: '',
                      description: '',
                      period: 'daily',
                      type: 'harvest',
                      targetItemId: 'wheat',
                      targetQuantity: 10,
                      rewardKZ: 100,
                      rewardItemId: '',
                      rewardItemQuantity: 0,
                      icon: '🎯'
                    })}
                    className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-[10px] font-bold hover:bg-stone-800 transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Nova Missão
                  </button>
                </div>
                <div className="p-6">
                  {missions.length === 0 ? (
                    <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-stone-400 text-xs">
                      No missions registered.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {missions.map(mission => (
                        <div key={mission.id} className="p-4 bg-stone-50 rounded-2xl border border-stone-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{mission.icon}</span>
                            <div>
                              <h4 className="font-bold text-sm">{mission.title}</h4>
                              <p className="text-[10px] text-stone-500 uppercase tracking-widest">
                                {mission.period === 'daily' ? 'Daily' : 'Weekly'} • {mission.type} • {mission.targetQuantity}x {currentCommodities[mission.targetItemId as keyof typeof currentCommodities]?.name || mission.targetItemId}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setAdminEditingMission({ ...mission, isNew: false })}
                              className="p-2 text-stone-400 hover:text-blue-600 transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => adminDeleteMission(mission.id)}
                              className="p-2 text-stone-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Game Configuration */}
              {adminTab === 'settings' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                  <h3 className="font-serif italic font-bold">Global Settings</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2">Initial Slots for New Players</label>
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        value={initialSlotsCount}
                        onChange={(e) => setInitialSlotsCount(Number(e.target.value))}
                        className="flex-1 bg-stone-100 p-3 rounded-xl outline-none text-sm"
                        min="1"
                        max="20"
                      />
                      <button 
                        onClick={() => adminUpdateInitialSlots(initialSlotsCount)}
                        className="px-6 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all text-xs"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-stone-100">
                    <h4 className="text-xs font-bold text-rose-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" /> Danger Zone
                    </h4>
                    <button 
                      onClick={adminResetAllAccounts}
                      className="w-full py-4 bg-rose-50 text-rose-600 border border-rose-200 rounded-2xl font-bold hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Trash2 className="w-5 h-5" /> TOTAL ACCOUNT RESET
                    </button>
                    <p className="text-[10px] text-stone-400 text-center mt-3 uppercase tracking-widest">
                      This will permanently erase all player progress.
                    </p>
                  </div>
                </div>
              </div>
              )}

              {/* Pending Deposits */}
              {adminTab === 'deposits' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                  <h3 className="font-serif italic font-bold">Pending Deposits</h3>
                </div>
                <div className="p-6 space-y-4">
                  {depositRequests.filter(r => r.status === 'pending').length === 0 ? (
                    <p className="text-sm text-stone-400 italic">No pending requests.</p>
                  ) : (
                    depositRequests.filter(r => r.status === 'pending').map(req => (
                      <div key={req.id} className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2">
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-sm">Usuário: {req.userId}</p>
                          <p className="font-bold text-sm">{req.amountKZ.toLocaleString()} KZ</p>
                        </div>
                        <p className="text-xs text-stone-600">Details: {req.details}</p>
                        <div className="flex gap-2 pt-2">
                          <button 
                            onClick={async () => {
                              const updates: Record<string, any> = {};
                              updates[`depositRequests/${req.id}/status`] = 'approved';
                              updates[`transactions/${req.userId}/${req.id}/status`] = 'completed';
                              updates[`users/${req.userId}/balanceKZ`] = rtdbIncrement(req.amountKZ);
                              updates[`globalConfig/system/playerDepositsMinusWithdrawals`] = rtdbIncrement(req.amountKZ);
                              
                              const notifRef = push(ref(rtdb, `notifications/${req.userId}`));
                              updates[`notifications/${req.userId}/${notifRef.key}`] = {
                                message: `Your deposit of ${req.amountKZ.toLocaleString()} KZ has been approved!`,
                                type: 'success',
                                timestamp: Date.now()
                              };

                              update(ref(rtdb), updates)
                                .then(() => addNotification('Deposit approved successfully!', 'success'))
                                .catch(err => handleRtdbError(err, OperationType.WRITE, `depositRequests`));
                            }}
                            className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                          <button 
                            onClick={async () => {
                              const updates: Record<string, any> = {};
                              updates[`depositRequests/${req.id}/status`] = 'rejected';
                              updates[`transactions/${req.userId}/${req.id}/status`] = 'rejected';
                              
                              const notifRef = push(ref(rtdb, `notifications/${req.userId}`));
                              updates[`notifications/${req.userId}/${notifRef.key}`] = {
                                message: `Your deposit of ${req.amountKZ.toLocaleString()} KZ has been rejected.`,
                                type: 'error',
                                timestamp: Date.now()
                              };

                              update(ref(rtdb), updates)
                                .then(() => addNotification('Deposit rejected successfully!', 'success'))
                                .catch(err => handleRtdbError(err, OperationType.WRITE, `depositRequests`));
                            }}
                            className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              )}

              {/* Pending Withdrawals */}
              {adminTab === 'withdrawals' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                  <h3 className="font-serif italic font-bold">Pending Withdrawals</h3>
                </div>
                <div className="p-6 space-y-4">
                  {withdrawalRequests.filter(r => r.status === 'pending').length === 0 ? (
                    <p className="text-sm text-stone-400 italic">No pending requests.</p>
                  ) : (
                    withdrawalRequests.filter(r => r.status === 'pending').map(req => (
                      <div key={req.id} className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2">
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-sm">Usuário: {req.userId}</p>
                          <p className="font-bold text-sm">{req.amountKZ.toLocaleString()} KZ</p>
                        </div>
                        <p className="text-xs text-stone-600">Method: {req.method}</p>
                        <p className="text-xs text-stone-600">Details: {req.details}</p>
                        <div className="flex gap-2 pt-2">
                          <button 
                            onClick={async () => {
                              const updates: Record<string, any> = {};
                              updates[`withdrawalRequests/${req.id}/status`] = 'approved';
                              updates[`transactions/${req.userId}/${req.id}/status`] = 'completed';
                              updates[`globalConfig/system/playerDepositsMinusWithdrawals`] = rtdbIncrement(-req.amountKZ);
                              const notifRef = push(ref(rtdb, `notifications/${req.userId}`));
                              updates[`notifications/${req.userId}/${notifRef.key}`] = {
                                message: `Your withdrawal of ${req.amountKZ.toLocaleString()} KZ has been approved!`,
                                type: 'success',
                                timestamp: Date.now()
                              };
                              update(ref(rtdb), updates)
                                .then(() => addNotification('Withdrawal approved successfully!', 'success'))
                                .catch(err => handleRtdbError(err, OperationType.WRITE, `withdrawalRequests`));
                            }}
                            className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                          <button 
                            onClick={async () => {
                              const updates: Record<string, any> = {};
                              updates[`withdrawalRequests/${req.id}/status`] = 'rejected';
                              updates[`transactions/${req.userId}/${req.id}/status`] = 'rejected';
                              updates[`users/${req.userId}/balanceKZ`] = rtdbIncrement(req.amountKZ); // Refund to user
                              const notifRef = push(ref(rtdb, `notifications/${req.userId}`));
                              updates[`notifications/${req.userId}/${notifRef.key}`] = {
                                message: `Your withdrawal of ${req.amountKZ.toLocaleString()} KZ has been rejected and the amount was refunded.`,
                                type: 'error',
                                timestamp: Date.now()
                              };
                              update(ref(rtdb), updates)
                                .then(() => addNotification('Withdrawal rejected successfully!', 'success'))
                                .catch(err => handleRtdbError(err, OperationType.WRITE, `withdrawalRequests`));
                            }}
                            className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              )}

              {/* Global Settings */}
              {adminTab === 'settings' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                  <h3 className="font-serif italic font-bold">Global Settings</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">System Tax (%)</label>
                      <input 
                        type="number"
                        value={gameConfig?.systemTax || 10}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          update(ref(rtdb, 'globalConfig/game/data'), { systemTax: val });
                        }}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">XP per Harvest</label>
                      <input 
                        type="number"
                        value={gameConfig?.xpPerHarvest || 10}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          update(ref(rtdb, 'globalConfig/game/data'), { xpPerHarvest: val });
                        }}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Starting Balance (KZ)</label>
                      <input 
                        type="number"
                        value={gameConfig?.startingBalance || 1000}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          update(ref(rtdb, 'globalConfig/game/data'), { startingBalance: val });
                        }}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Slot Price (KZ)</label>
                      <input 
                        type="number"
                        value={gameConfig?.slotPrice || 5000}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          update(ref(rtdb, 'globalConfig/game/data'), { slotPrice: val });
                        }}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Production Tax (KZ)</label>
                      <input 
                        type="number"
                        value={gameConfig?.productionTaxKZ || 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          update(ref(rtdb, 'globalConfig/game/data'), { productionTaxKZ: val });
                        }}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none focus:ring-2 focus:ring-stone-900"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase text-stone-400 tracking-widest">Initial Products</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(currentCommodities).map(([id, data]: [string, any]) => (
                        <div key={id} className="flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-100">
                          <span className="text-xs font-bold flex-1">{data.name}</span>
                          <input 
                            type="number"
                            value={gameConfig?.initialInventory?.[id] || 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const newInv = { ...(gameConfig?.initialInventory || {}), [id]: val };
                              update(ref(rtdb, 'globalConfig/game/data'), { initialInventory: newInv });
                            }}
                            className="w-16 bg-white border border-stone-200 p-1 rounded text-center text-xs font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-stone-100">
                    <button 
                      onClick={() => {
                        // Sincronização direta sem window.confirm (não suportado no iframe)
                        const updates: Record<string, any> = {};
                        Object.entries(COMMODITIES).forEach(([id, data]) => {
                          updates[`globalConfig/game/data/commodities/${id}`] = data;
                        });
                        update(ref(rtdb), updates).then(() => {
                          addNotification('Itens sincronizados com sucesso!', 'success');
                        }).catch(err => {
                          addNotification('Erro ao sincronizar itens.', 'error');
                          console.error(err);
                        });
                      }}
                      className="w-full py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> Sincronizar Itens com Padrões
                    </button>
                    <p className="text-[8px] text-stone-400 text-center mt-2 uppercase tracking-widest">
                      Use isto para refletir as definições de alimentação padrão no banco de dados.
                    </p>
                  </div>
                </div>
              </div>
              )}

              {/* Commodities Management */}
              {adminTab === 'commodities' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
                  <h3 className="font-serif italic font-bold">Manage Items and Prices</h3>
                  <button 
                    onClick={() => setAdminEditingItem({ id: '', name: '', type: 'seed', category: 'semente', price: 10, product: '', consumes: '', basePrice: 0, growthTime: 60, lifespan: 5, isNew: true })}
                    className="p-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-all flex items-center gap-2 text-xs font-bold"
                  >
                    <PlusCircle className="w-4 h-4" /> New Item
                  </button>
                </div>
                <div className="divide-y divide-stone-100">
                  {Object.entries(currentCommodities).map(([id, data]: [string, any]) => (
                    <div key={id} className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                          {data.type === 'seed' ? <Sprout className="w-5 h-5 text-amber-600" /> : 
                           data.type === 'animal' ? <Users className="w-5 h-5 text-blue-600" /> :
                           <Package className="w-5 h-5 text-emerald-600" />}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">{data.name}</h4>
                          <p className="text-[10px] text-stone-400 uppercase tracking-widest">
                            {data.type === 'seed' || data.type === 'animal' ? 
                              `Price: ${data.price} KZ · Generates: ${data.product}` :
                              `Base: ${data.basePrice} KZ · Growth: ${data.growthTime}s`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => adminGiveItemToUser(user.uid, id, 10)}
                          title="Dar 10 unidades para mim"
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setAdminEditingItem({ ...data, id })}
                          className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {itemToDeleteId === id ? (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => adminDeleteCommodity(id)}
                              className="px-2 py-1 bg-rose-600 text-white text-[10px] font-bold rounded-lg hover:bg-rose-700"
                            >
                              Confirmar
                            </button>
                            <button 
                              onClick={() => setItemToDeleteId(null)}
                              className="p-1 text-stone-400 hover:text-stone-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setItemToDeleteId(id)}
                            className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* User Management */}
              {adminTab === 'users' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                  <h3 className="font-serif italic font-bold">Search Users</h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Nome, Email ou UID..."
                      value={adminSearchUser}
                      onChange={(e) => setAdminSearchUser(e.target.value)}
                      className="flex-1 bg-stone-100 p-3 rounded-xl outline-none focus:ring-2 focus:ring-stone-900 transition-all text-sm"
                    />
                    <button 
                      onClick={adminSearchUsers}
                      className="px-6 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
                    >
                      <Users className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="divide-y divide-stone-100">
                    {adminUsers.map(u => (
                      <div key={u.uid} className="py-3 flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-sm">{u.name}</h4>
                          <p className="text-[10px] text-stone-400">{u.email} · {u.balanceKZ?.toLocaleString()} KZ · Nível {u.level || 1}</p>
                        </div>
                        <div className="flex gap-2">
                      <button 
                            onClick={() => {
                              setAdminActionUser(u);
                              setAdminActionType('give_item');
                              setAdminActionItemId(Object.keys(currentCommodities)[0]);
                              setAdminActionValue(10);
                            }}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            title="Give Items"
                          >
                            <Package className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              setAdminActionUser(u);
                              setAdminActionType('give_balance');
                              setAdminActionValue(1000);
                            }}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                            title="Give Balance"
                          >
                            <Wallet className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => adminBanUser(u.uid, !u.banned)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
                              u.banned ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                            }`}
                          >
                            {u.banned ? 'Unban' : 'Ban'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )}

              {/* Level Management */}
              {adminTab === 'levels' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
                  <h3 className="font-serif italic font-bold">Level Management</h3>
                  <button 
                    onClick={() => setAdminEditingLevel({ level: (levelsConfig.length + 1), xpRequired: 0, rewardKZ: 0, isNew: true })}
                    className="p-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-all flex items-center gap-2 text-xs font-bold"
                  >
                    <PlusCircle className="w-4 h-4" /> New Level
                  </button>
                </div>
                <div className="divide-y divide-stone-100">
                  {levelsConfig.map(l => (
                    <div key={l.level} className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">Level {l.level}</h4>
                          <p className="text-[10px] text-stone-400 uppercase tracking-widest">XP: {l.xpRequired} · Reward: {l.rewardKZ} KZ</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setAdminEditingLevel({ ...l })}
                          className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => adminDeleteLevel(l.level)}
                          className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* Recipe Management */}
              {adminTab === 'recipes' && (
              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center">
                  <h3 className="font-serif italic font-bold">Manage Recipes (Production)</h3>
                  <button 
                    onClick={() => setAdminEditingRecipe({ id: '', name: '', inputs: [{ itemId: '', quantity: 1 }], output: { itemId: '', quantity: 1 }, duration: 60, isNew: true })}
                    className="p-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-all flex items-center gap-2 text-xs font-bold"
                  >
                    <PlusCircle className="w-4 h-4" /> New Recipe
                  </button>
                </div>
                <div className="divide-y divide-stone-100">
                  {Object.entries(currentRecipes).map(([id, data]: [string, any]) => (
                    <div key={id} className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                          <Settings className="w-5 h-5 text-stone-600" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">{data.name}</h4>
                          <p className="text-[10px] text-stone-400 uppercase tracking-widest">
                            Duration: {data.duration}s · Inputs: {data.inputs.length}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setAdminEditingRecipe({ ...data, id })}
                          className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            askConfirmation(
                              'Delete Recipe',
                              `Are you sure you want to delete the recipe ${data.name}?`,
                              () => adminDeleteRecipe(id)
                            );
                          }}
                          className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div 
              key={n.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`px-4 py-2 rounded-xl text-xs font-bold shadow-lg ${n.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}
            >
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Admin Edit Modal */}
      <AnimatePresence>
        {adminEditingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAdminEditingItem(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
                <h3 className="font-serif italic text-xl font-bold">
                  {adminEditingItem.isNew ? 'Add New Item' : `Edit ${adminEditingItem.name}`}
                </h3>
                
                <div className="space-y-3">
                  {adminEditingItem.isNew && (
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Item ID (slug)</label>
                      <input 
                        type="text"
                        value={adminEditingItem.id}
                        onChange={(e) => setAdminEditingItem({ ...adminEditingItem, id: e.target.value })}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                        placeholder="ex: cotton"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Icon (Emoji)</label>
                    <div className="grid grid-cols-8 gap-1 mt-1 max-h-32 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-100">
                      {[...AVAILABLE_ICONS.animals, ...AVAILABLE_ICONS.crops, ...AVAILABLE_ICONS.special].map(emoji => (
                        <button 
                          key={emoji}
                          onClick={() => setAdminEditingItem({ ...adminEditingItem, icon: emoji })}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all ${adminEditingItem.icon === emoji ? 'bg-stone-900 text-white scale-110' : 'bg-white hover:bg-stone-100'}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <input 
                      type="text"
                      value={adminEditingItem.icon || ''}
                      onChange={(e) => setAdminEditingItem({ ...adminEditingItem, icon: e.target.value })}
                      className="w-full mt-2 bg-stone-100 p-3 rounded-xl outline-none text-center text-xl"
                      placeholder="Or paste an emoji here"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Item Name</label>
                    <input 
                      type="text"
                      value={adminEditingItem.name}
                      onChange={(e) => setAdminEditingItem({ ...adminEditingItem, name: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Category</label>
                    <select 
                      value={adminEditingItem.category || 'agricola'}
                      onChange={(e) => setAdminEditingItem({ ...adminEditingItem, category: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    >
                      <option value="agricola">Agricultural</option>
                      <option value="pecuaria">Livestock</option>
                      <option value="industrial">Industrial</option>
                      <option value="semente">Seed</option>
                      <option value="animal">Animal</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Item Type</label>
                    <select 
                      value={adminEditingItem.type || 'seed'}
                      onChange={(e) => {
                        const type = e.target.value;
                        setAdminEditingItem({ 
                          ...adminEditingItem, 
                          type,
                          category: type === 'seed' ? 'semente' : type === 'animal' ? 'animal' : (type === 'crop' ? 'agricola' : (type === 'product' ? 'pecuaria' : 'industrial'))
                        });
                      }}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    >
                      <option value="seed">Seed</option>
                      <option value="animal">Animal</option>
                      <option value="crop">Crop</option>
                      <option value="product">Product (Harvest)</option>
                      <option value="processed">Processed</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Rarity</label>
                    <select 
                      value={adminEditingItem.rarity || 'common'}
                      onChange={(e) => setAdminEditingItem({ ...adminEditingItem, rarity: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    >
                      <option value="common">Common</option>
                      <option value="uncommon">Uncommon</option>
                      <option value="rare">Rare</option>
                      <option value="legendary">Legendary</option>
                    </select>
                  </div>

                  {(adminEditingItem.type === 'seed' || adminEditingItem.type === 'animal') ? (
                    <>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-stone-400">Purchase Price (Shop) (KZ)</label>
                        <input 
                          type="number"
                          value={adminEditingItem.price || 0}
                          onChange={(e) => setAdminEditingItem({ ...adminEditingItem, price: Number(e.target.value) })}
                          className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-stone-400">Generated Product ID</label>
                        <select 
                          value={adminEditingItem.product || ''}
                          onChange={(e) => setAdminEditingItem({ ...adminEditingItem, product: e.target.value })}
                          className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                        >
                          <option value="">Select Product...</option>
                          {Object.entries(currentCommodities)
                            .filter(([_, d]: [string, any]) => d.type !== 'seed' && d.type !== 'animal')
                            .map(([id, d]: [string, any]) => (
                              <option key={id} value={id}>{d.name}</option>
                            ))
                          }
                        </select>
                      </div>
                      {adminEditingItem.type === 'animal' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-stone-400">Consumes (Food)</label>
                            <select 
                              value={adminEditingItem.consumes || ''}
                              onChange={(e) => setAdminEditingItem({ ...adminEditingItem, consumes: e.target.value })}
                              className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                            >
                              <option value="">Select Food...</option>
                              {Object.entries(currentCommodities)
                                .filter(([_, d]: [string, any]) => d.type === 'processed' || d.type === 'crop')
                                .map(([id, d]: [string, any]) => (
                                  <option key={id} value={id}>{d.name}</option>
                                ))
                              }
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase text-stone-400">Lifespan (Harvests)</label>
                            <input 
                              type="number"
                              value={adminEditingItem.lifespan || 5}
                              onChange={(e) => setAdminEditingItem({ ...adminEditingItem, lifespan: Number(e.target.value) })}
                              className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-stone-400">Base Price (Market) (KZ)</label>
                          <input 
                            type="number"
                            value={adminEditingItem.basePrice || 0}
                            onChange={(e) => setAdminEditingItem({ ...adminEditingItem, basePrice: Number(e.target.value) })}
                            className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-stone-400">Time (s)</label>
                          <input 
                            type="number"
                            value={adminEditingItem.growthTime || 0}
                            onChange={(e) => setAdminEditingItem({ ...adminEditingItem, growthTime: Number(e.target.value) })}
                            className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                          />
                        </div>
                      </div>
                      {adminEditingItem.type === 'product' && (
                        <div>
                          <label className="text-[10px] font-bold uppercase text-stone-400">Seed Drop Chance (0-1)</label>
                          <input 
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            value={adminEditingItem.seedDropChance || 0}
                            onChange={(e) => setAdminEditingItem({ ...adminEditingItem, seedDropChance: Number(e.target.value) })}
                            className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={() => setAdminEditingItem(null)}
                    className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  {!adminEditingItem.isNew && (
                    <button 
                      onClick={() => adminDeleteCommodity(adminEditingItem.id)}
                      className="px-4 py-3 bg-rose-100 text-rose-600 rounded-xl font-bold"
                    >
                      Delete
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (adminEditingItem.isNew) {
                        adminAddCommodity(adminEditingItem.id, {
                          name: adminEditingItem.name,
                          type: adminEditingItem.type,
                          category: adminEditingItem.category,
                          price: adminEditingItem.price || 0,
                          product: adminEditingItem.product || '',
                          basePrice: adminEditingItem.basePrice || 0,
                          growthTime: adminEditingItem.growthTime || 0,
                          consumes: adminEditingItem.consumes || '',
                          icon: adminEditingItem.icon || '',
                          lifespan: adminEditingItem.lifespan || 5
                        });
                      } else {
                        adminUpdateCommodity(adminEditingItem.id, adminEditingItem);
                      }
                    }}
                    className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-bold"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Level Modal */}
      <AnimatePresence>
        {adminEditingLevel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAdminEditingLevel(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
                <h3 className="font-serif italic text-xl font-bold">
                  {adminEditingLevel.isNew ? 'Add New Level' : `Edit Level ${adminEditingLevel.level}`}
                </h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Level</label>
                    <input 
                      type="number"
                      value={adminEditingLevel.level}
                      onChange={(e) => setAdminEditingLevel({ ...adminEditingLevel, level: Number(e.target.value) })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                      readOnly={!adminEditingLevel.isNew}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Required XP</label>
                    <input 
                      type="number"
                      value={adminEditingLevel.xpRequired}
                      onChange={(e) => setAdminEditingLevel({ ...adminEditingLevel, xpRequired: Number(e.target.value) })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Reward on Reaching (KZ)</label>
                    <input 
                      type="number"
                      value={adminEditingLevel.rewardKZ}
                      onChange={(e) => setAdminEditingLevel({ ...adminEditingLevel, rewardKZ: Number(e.target.value) })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={() => setAdminEditingLevel(null)}
                    className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (adminEditingLevel.isNew) {
                        adminAddLevel(adminEditingLevel);
                      } else {
                        adminUpdateLevel(adminEditingLevel.level, adminEditingLevel);
                      }
                    }}
                    className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-bold"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Action Modal (Give Item/Balance) */}
      <AnimatePresence>
        {adminActionUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAdminActionUser(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
                <h3 className="font-serif italic text-xl font-bold">
                  {adminActionType === 'give_item' ? `Give Items to ${adminActionUser.name}` : `Give Balance to ${adminActionUser.name}`}
                </h3>
                
                <div className="space-y-3">
                  {adminActionType === 'give_item' && (
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Select Item</label>
                      <select 
                        value={adminActionItemId}
                        onChange={(e) => setAdminActionItemId(e.target.value)}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                      >
                        {Object.entries(currentCommodities).map(([id, d]: [string, any]) => (
                          <option key={id} value={id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">
                      {adminActionType === 'give_item' ? 'Quantity' : 'Value (KZ)'}
                    </label>
                    <input 
                      type="number"
                      value={adminActionValue}
                      onChange={(e) => setAdminActionValue(Number(e.target.value))}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={() => setAdminActionUser(null)}
                    className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (adminActionType === 'give_item') {
                        adminGiveItemToUser(adminActionUser.uid, adminActionItemId, adminActionValue);
                      } else {
                        adminGiveBalanceToUser(adminActionUser.uid, adminActionValue);
                      }
                    }}
                    className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-bold"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Admin Mission Modal */}
      <AnimatePresence>
        {adminEditingMission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAdminEditingMission(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
                <h3 className="font-serif italic text-xl font-bold">
                  {adminEditingMission.isNew ? 'Create New Mission' : 'Edit Mission'}
                </h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Title</label>
                      <input 
                        type="text"
                        value={adminEditingMission.title}
                        onChange={(e) => setAdminEditingMission({ ...adminEditingMission, title: e.target.value })}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                        placeholder="Ex: Corn Harvest"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Period</label>
                      <select 
                        value={adminEditingMission.period}
                        onChange={(e) => setAdminEditingMission({ ...adminEditingMission, period: e.target.value })}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Description</label>
                    <textarea 
                      value={adminEditingMission.description}
                      onChange={(e) => setAdminEditingMission({ ...adminEditingMission, description: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none h-20 resize-none"
                      placeholder="Mission description..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Objective Type</label>
                      <select 
                        value={adminEditingMission.type}
                        onChange={(e) => setAdminEditingMission({ ...adminEditingMission, type: e.target.value })}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                      >
                        <option value="harvest">Harvest</option>
                        <option value="produce">Produce</option>
                        <option value="sell">Sell</option>
                        <option value="buy">Buy</option>
                        <option value="delivery">Deliver (Burn)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Target Item</label>
                      <select 
                        value={adminEditingMission.targetItemId}
                        onChange={(e) => setAdminEditingMission({ ...adminEditingMission, targetItemId: e.target.value })}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                      >
                        <option value="">Any Item</option>
                        {Object.entries(currentCommodities).map(([id, d]: [string, any]) => (
                          <option key={id} value={id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Target Quantity</label>
                      <input 
                        type="number"
                        value={adminEditingMission.targetQuantity}
                        onChange={(e) => setAdminEditingMission({ ...adminEditingMission, targetQuantity: Number(e.target.value) })}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Icon (Emoji)</label>
                      <input 
                        type="text"
                        value={adminEditingMission.icon}
                        onChange={(e) => setAdminEditingMission({ ...adminEditingMission, icon: e.target.value })}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none text-center text-2xl"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-3">
                    <p className="text-[10px] font-bold uppercase text-stone-400 border-b border-stone-200 pb-1">Rewards</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-stone-400">Balance (KZ)</label>
                        <input 
                          type="number"
                          value={adminEditingMission.rewardKZ}
                          onChange={(e) => setAdminEditingMission({ ...adminEditingMission, rewardKZ: Number(e.target.value) })}
                          className="w-full bg-white p-2 rounded-lg border border-stone-200 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-stone-400">Reward Item</label>
                        <select 
                          value={adminEditingMission.rewardItemId}
                          onChange={(e) => setAdminEditingMission({ ...adminEditingMission, rewardItemId: e.target.value })}
                          className="w-full bg-white p-2 rounded-lg border border-stone-200 outline-none"
                        >
                          <option value="">None</option>
                          {Object.entries(currentCommodities).map(([id, d]: [string, any]) => (
                            <option key={id} value={id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {adminEditingMission.rewardItemId && (
                      <div>
                        <label className="text-[10px] font-bold uppercase text-stone-400">Reward Item Qty</label>
                        <input 
                          type="number"
                          value={adminEditingMission.rewardItemQuantity}
                          onChange={(e) => setAdminEditingMission({ ...adminEditingMission, rewardItemQuantity: Number(e.target.value) })}
                          className="w-full bg-white p-2 rounded-lg border border-stone-200 outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={() => setAdminEditingMission(null)}
                    className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => adminAddMission(adminEditingMission.id, adminEditingMission)}
                    className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-bold"
                  >
                    Save Mission
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {adminEditingRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAdminEditingRecipe(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
                <h3 className="font-serif italic text-xl font-bold">
                  {adminEditingRecipe.isNew ? 'Add New Recipe' : `Edit ${adminEditingRecipe.name}`}
                </h3>
                
                <div className="space-y-4">
                  {adminEditingRecipe.isNew && (
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400">Recipe ID (slug)</label>
                      <input 
                        type="text"
                        value={adminEditingRecipe.id}
                        onChange={(e) => setAdminEditingRecipe({ ...adminEditingRecipe, id: e.target.value })}
                        className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                        placeholder="ex: chocolate"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Recipe Name</label>
                    <input 
                      type="text"
                      value={adminEditingRecipe.name}
                      onChange={(e) => setAdminEditingRecipe({ ...adminEditingRecipe, name: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Icon (Emoji)</label>
                    <div className="grid grid-cols-8 gap-1 mt-1 max-h-32 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-100">
                      {[...AVAILABLE_ICONS.animals, ...AVAILABLE_ICONS.crops, ...AVAILABLE_ICONS.special].map(emoji => (
                        <button 
                          key={emoji}
                          onClick={() => setAdminEditingRecipe({ ...adminEditingRecipe, icon: emoji })}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all ${adminEditingRecipe.icon === emoji ? 'bg-stone-900 text-white scale-110' : 'bg-white hover:bg-stone-100'}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <input 
                      type="text"
                      value={adminEditingRecipe.icon || ''}
                      onChange={(e) => setAdminEditingRecipe({ ...adminEditingRecipe, icon: e.target.value })}
                      className="w-full mt-2 bg-stone-100 p-3 rounded-xl outline-none text-center text-xl"
                      placeholder="Or paste an emoji here"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase text-stone-400">Ingredients (Inputs)</label>
                      <button 
                        onClick={() => setAdminEditingRecipe({ 
                          ...adminEditingRecipe, 
                          inputs: [...adminEditingRecipe.inputs, { itemId: '', quantity: 1 }] 
                        })}
                        className="text-[10px] bg-stone-900 text-white px-2 py-1 rounded-lg font-bold"
                      >
                        + Add
                      </button>
                    </div>
                    {adminEditingRecipe.inputs.map((input: any, idx: number) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select 
                          value={input.itemId}
                          onChange={(e) => {
                            const newInputs = [...adminEditingRecipe.inputs];
                            newInputs[idx].itemId = e.target.value;
                            setAdminEditingRecipe({ ...adminEditingRecipe, inputs: newInputs });
                          }}
                          className="flex-1 bg-stone-100 p-2 rounded-xl text-xs outline-none"
                        >
                          <option value="">Item...</option>
                          {Object.entries(currentCommodities).map(([id, d]: [string, any]) => (
                            <option key={id} value={id}>{d.name}</option>
                          ))}
                        </select>
                        <input 
                          type="number"
                          value={input.quantity}
                          onChange={(e) => {
                            const newInputs = [...adminEditingRecipe.inputs];
                            newInputs[idx].quantity = Number(e.target.value);
                            setAdminEditingRecipe({ ...adminEditingRecipe, inputs: newInputs });
                          }}
                          className="w-16 bg-stone-100 p-2 rounded-xl text-xs text-center outline-none"
                        />
                        <button 
                          onClick={() => {
                            const newInputs = adminEditingRecipe.inputs.filter((_: any, i: number) => i !== idx);
                            setAdminEditingRecipe({ ...adminEditingRecipe, inputs: newInputs });
                          }}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-stone-400">Result (Output)</label>
                    <div className="flex gap-2 items-center">
                      <select 
                        value={adminEditingRecipe.output.itemId}
                        onChange={(e) => setAdminEditingRecipe({ 
                          ...adminEditingRecipe, 
                          output: { ...adminEditingRecipe.output, itemId: e.target.value } 
                        })}
                        className="flex-1 bg-stone-100 p-2 rounded-xl text-xs outline-none"
                      >
                        <option value="">Item...</option>
                        {Object.entries(currentCommodities).map(([id, d]: [string, any]) => (
                          <option key={id} value={id}>{d.name}</option>
                        ))}
                      </select>
                      <input 
                        type="number"
                        value={adminEditingRecipe.output.quantity}
                        onChange={(e) => setAdminEditingRecipe({ 
                          ...adminEditingRecipe, 
                          output: { ...adminEditingRecipe.output, quantity: Number(e.target.value) } 
                        })}
                        className="w-16 bg-stone-100 p-2 rounded-xl text-xs text-center outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Production Duration (seconds)</label>
                    <input 
                      type="number"
                      value={adminEditingRecipe.duration}
                      onChange={(e) => setAdminEditingRecipe({ ...adminEditingRecipe, duration: Number(e.target.value) })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={() => setAdminEditingRecipe(null)}
                    className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (!adminEditingRecipe.id || !adminEditingRecipe.name) {
                        addNotification('ID and Name are required!', 'error');
                        return;
                      }
                      if (adminEditingRecipe.isNew) {
                        adminAddRecipe(adminEditingRecipe.id, {
                          name: adminEditingRecipe.name,
                          icon: adminEditingRecipe.icon || '',
                          inputs: adminEditingRecipe.inputs,
                          output: adminEditingRecipe.output,
                          duration: adminEditingRecipe.duration
                        });
                      } else {
                        adminUpdateRecipe(adminEditingRecipe.id, {
                          ...adminEditingRecipe,
                          icon: adminEditingRecipe.icon || ''
                        });
                      }
                    }}
                    className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-bold"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Listing Modal */}
      {/* Admin Edit Weather Effect Modal */}
      <AnimatePresence>
        {adminEditingWeatherEffect && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-8 space-y-8 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{adminEditingWeatherEffect.icon}</span>
                    <h3 className="font-serif italic text-2xl font-bold text-stone-900">Edit {adminEditingWeatherEffect.name}</h3>
                  </div>
                  <button onClick={() => setAdminEditingWeatherEffect(null)} className="p-2 bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Weather Description</label>
                    <textarea 
                      value={adminEditingWeatherEffect.description}
                      onChange={(e) => setAdminEditingWeatherEffect({ ...adminEditingWeatherEffect, description: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all min-h-[80px] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Growth Mult.</label>
                      <input 
                        type="number"
                        step="0.1"
                        value={adminEditingWeatherEffect.growthMultiplier}
                        onChange={(e) => setAdminEditingWeatherEffect({ ...adminEditingWeatherEffect, growthMultiplier: Number(e.target.value) })}
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all font-mono font-bold"
                      />
                      <p className="text-[8px] text-stone-400 mt-1 uppercase tracking-widest">1.0 = Normal | &gt;1.0 = Faster</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Production Mult.</label>
                      <input 
                        type="number"
                        step="0.1"
                        value={adminEditingWeatherEffect.yieldMultiplier}
                        onChange={(e) => setAdminEditingWeatherEffect({ ...adminEditingWeatherEffect, yieldMultiplier: Number(e.target.value) })}
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all font-mono font-bold"
                      />
                      <p className="text-[8px] text-stone-400 mt-1 uppercase tracking-widest">1.0 = Normal | &lt;1.0 = Lower yield</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Bonus Category (Optional)</label>
                    <select
                      value={adminEditingWeatherEffect.bonusCategory || ''}
                      onChange={(e) => setAdminEditingWeatherEffect({ ...adminEditingWeatherEffect, bonusCategory: e.target.value || undefined })}
                      className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all"
                    >
                      <option value="">None</option>
                      <option value="coffee">Coffee</option>
                      <option value="cotton">Cotton</option>
                      <option value="agricola">Agricultural</option>
                      <option value="pecuaria">Livestock</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setAdminEditingWeatherEffect(null)}
                    className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => adminUpdateWeatherEffect(adminEditingWeatherEffect.id, adminEditingWeatherEffect)}
                    className="flex-[2] py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg shadow-stone-200"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {listingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-6 overflow-y-auto no-scrollbar">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center">
                    <Package className="w-6 h-6 text-stone-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Sell {listingItem.name}</h3>
                    <p className="text-xs text-stone-500">Set your offer details</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Quantity</label>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setListingQty(Math.max(1, listingQty - 1))}
                        className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center font-bold"
                      >-</button>
                      <span className="flex-1 text-center font-mono font-bold text-xl">{listingQty}</span>
                      <button 
                        onClick={() => setListingQty(Math.min(inventory[listingItem.id] || 0, listingQty + 1))}
                        className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center font-bold"
                      >+</button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">Price per Unit (KZ)</label>
                    <input 
                      type="number"
                      value={listingPrice}
                      onChange={(e) => setListingPrice(Number(e.target.value))}
                      className="w-full bg-stone-100 p-4 rounded-2xl font-mono font-bold text-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                    <p className="text-[10px] text-stone-400 mt-2">Suggested price: {listingItem.price.toFixed(0)} KZ</p>
                  </div>

                  <div className="bg-emerald-50 p-4 rounded-2xl flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-700">Total to Receive</span>
                    <span className="font-mono font-bold text-emerald-700">{(listingPrice * listingQty).toLocaleString()} KZ</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setListingItem(null)}
                    className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      listOnMarket(listingItem.id, listingQty, listingPrice, Date.now());
                      setListingItem(null);
                    }}
                    className="flex-2 py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all"
                  >
                    Confirm Offer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeposit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeposit(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-6 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center">
                  <h3 className="font-serif italic text-xl font-bold">Deposit</h3>
                  <button onClick={() => setShowDeposit(false)} classNam                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2">
                  <p className="text-xs font-bold text-stone-600">Method: Bank Transfer</p>
                  <p className="text-xs text-stone-600">IBAN: <span className="font-mono font-bold">005500005049246510146</span></p>
                </div>
                
                <p className="text-xs text-stone-500">After making the transfer, enter the amount and the receipt details below to request administrator approval.</p>

                <div className="space-y-4">
                  {depositError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-rose-800 font-medium leading-relaxed">{depositError}</p>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] uppercase font-bold text-stone-400 tracking-widest">Amount (KZ)</label>
                    <input type="number" className="w-full p-3 bg-stone-50 rounded-xl border border-stone-200" placeholder="0" id="depositAmount" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-stone-400 tracking-widest">Details (Name/Reference)</label>
                    <input type="text" className="w-full p-3 bg-stone-50 rounded-xl border border-stone-200" placeholder="Enter receipt details..." id="depositDetails" />
                  </div>
                  
                  <button 
                    onClick={async () => {
                      const amount = parseFloat((document.getElementById('depositAmount') as HTMLInputElement).value);
                      const details = (document.getElementById('depositDetails') as HTMLInputElement).value;
                      
                      if (!amount || amount <= 0) {
                        setDepositError('Enter a valid amount.');
                        return;
                      }
                      if (!details) {
                        setDepositError('Please enter payment details.');
                        return;
                      }

                      const updates: Record<string, any> = {};
                      
                      const reqRef = push(ref(rtdb, `depositRequests`));
                      updates[`depositRequests/${reqRef.key}`] = {
                        id: reqRef.key,
                        userId: user.uid,
                        amountKZ: amount,
                        details,
                        timestamp: Date.now(),
                        status: 'pending'
                      };
                      
                      const transRef = push(ref(rtdb, `transactions/${user.uid}`));
                      updates[`transactions/${user.uid}/${transRef.key}`] = {
                        id: transRef.key,
                        userId: user.uid,
                        type: 'deposit_request',
                        amountKZ: amount,
                        timestamp: Date.now(),
                        status: 'pending'
                      };

                      update(ref(rtdb), updates).then(() => {
                        setShowDeposit(false);
                        setDepositError(null);
                        addNotification('Deposit request sent successfully!', 'success');
                      }).catch(err => handleRtdbError(err, OperationType.WRITE, `depositRequests`));
                    }}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
                  >
                    Send Request
                  </button>0 transition-all"
                  >
                    Enviar Solicitação
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Event Scheduling Modal */}
      <AnimatePresence>
        {showEventModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto no-scrollbar">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEventModal(false)}
              className="fixed inset-0 bg-stone-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] z-[70]"
            >
              <div className="p-8 space-y-8 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center">
                  <h3 className="font-serif italic text-2xl font-bold text-stone-900">Schedule New Event</h3>
                  <button onClick={() => setShowEventModal(false)} className="p-2 bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Templates */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-3 tracking-widest">Quick Templates</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {Object.values(EVENT_TEMPLATES).map(template => (
                        <button
                          key={template.type}
                          onClick={() => setNewEventData({
                            ...newEventData,
                            name: template.name,
                            icon: template.icon,
                            description: template.description,
                            type: template.type as 'bonus_yield' | 'market_boom' | 'xp_boost',
                            multiplier: template.multiplier
                          })}
                          className="p-3 bg-stone-50 border border-stone-100 rounded-2xl hover:border-stone-300 transition-all text-left"
                        >
                          <span className="text-xl block mb-1">{template.icon}</span>
                          <span className="text-[10px] font-bold text-stone-900 block truncate">{template.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Event Name</label>
                      <input 
                        type="text"
                        value={newEventData.name}
                        onChange={(e) => setNewEventData({ ...newEventData, name: e.target.value })}
                        placeholder="Ex: Coffee Festival"
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Icon</label>
                      <input 
                        type="text"
                        value={newEventData.icon}
                        onChange={(e) => setNewEventData({ ...newEventData, icon: e.target.value })}
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Description</label>
                    <textarea 
                      value={newEventData.description}
                      onChange={(e) => setNewEventData({ ...newEventData, description: e.target.value })}
                      placeholder="What happens during this event?"
                      className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all min-h-[100px] resize-none"
                    />
                  </div>

                  {/* Timing */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Start</label>
                      <input 
                        type="datetime-local"
                        onChange={(e) => setNewEventData({ ...newEventData, startTime: new Date(e.target.value).getTime() })}
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">End</label>
                      <input 
                        type="datetime-local"
                        onChange={(e) => setNewEventData({ ...newEventData, endTime: new Date(e.target.value).getTime() })}
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all"
                      />
                    </div>
                  </div>

                  {/* Multiplier */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400 block mb-2 tracking-widest">Multiplier (Ex: 1.5 = +50%)</label>
                    <input 
                      type="number"
                      step="0.1"
                      value={newEventData.multiplier}
                      onChange={(e) => setNewEventData({ ...newEventData, multiplier: Number(e.target.value) })}
                      className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none text-sm focus:border-stone-300 transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setShowEventModal(false)}
                    className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      adminScheduleEvent(newEventData);
                      setShowEventModal(false);
                    }}
                    className="flex-[2] py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg shadow-stone-200"
                  >
                    Schedule Event
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200"
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-stone-800">{confirmModal.title}</h3>
              </div>
              <p className="text-stone-600 mb-8 leading-relaxed">
                {confirmModal.message}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="flex-1 py-3 px-4 rounded-2xl bg-stone-100 text-stone-600 font-bold hover:bg-stone-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    setConfirmModal(prev => ({ ...prev, show: false }));
                    confirmModal.onConfirm();
                  }}
                  className="flex-1 py-3 px-4 rounded-2xl bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors shadow-lg shadow-amber-200"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-6 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center">
                  <h3 className="font-serif italic text-xl font-bold">Edit Profile</h3>
                  <button onClick={() => setShowProfileModal(false)} className="text-stone-400 hover:text-stone-600">×</button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Name</label>
                    <input 
                      type="text"
                      value={profile?.name || ''}
                      onChange={(e) => update(ref(rtdb, `users/${user.uid}`), { name: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Date of Birth</label>
                    <input 
                      type="date"
                      value={profile?.dob || ''}
                      onChange={(e) => update(ref(rtdb, `users/${user.uid}`), { dob: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">IBAN</label>
                    <input 
                      type="text"
                      value={profile?.iban || ''}
                      onChange={(e) => update(ref(rtdb, `users/${user.uid}`), { iban: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-stone-400">Bank Name</label>
                    <input 
                      type="text"
                      value={profile?.bankName || ''}
                      onChange={(e) => update(ref(rtdb, `users/${user.uid}`), { bankName: e.target.value })}
                      className="w-full bg-stone-100 p-3 rounded-xl outline-none"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Market Item Chart Modal */}
      <AnimatePresence>
        {selectedMarketItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMarketItem(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl relative overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    {((currentCommodities as any)[selectedMarketItem.itemId])?.icon ? (
                      <span className="text-xl">{((currentCommodities as any)[selectedMarketItem.itemId]).icon}</span>
                    ) : (
                      <Package className="w-5 h-5 text-stone-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif italic text-xl font-bold">{selectedMarketItem.name}</h3>
                    <p className="text-[10px] text-stone-400 uppercase tracking-widest">
                      {((currentCommodities as any)[selectedMarketItem.itemId])?.category || 'Commodity'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedMarketItem(null)} className="text-stone-400 hover:text-stone-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-stone-50 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold uppercase text-stone-400 mb-1">Current Price</p>
                    <div className="text-2xl font-mono font-bold text-stone-800">
                      {selectedMarketItem.currentPrice.toFixed(2)} <span className="text-sm">KZ</span>
                    </div>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold uppercase text-stone-400 mb-1">Variation</p>
                    <div className={`text-2xl font-mono font-bold flex items-center gap-2 ${selectedMarketItem.currentPrice >= selectedMarketItem.basePrice ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {selectedMarketItem.currentPrice >= selectedMarketItem.basePrice ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      {Math.abs(((selectedMarketItem.currentPrice - selectedMarketItem.basePrice) / selectedMarketItem.basePrice) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={generateMockHistory(selectedMarketItem)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#a8a29e' }} 
                        dy={10}
                      />
                      <YAxis 
                        domain={['auto', 'auto']} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#a8a29e' }}
                        tickFormatter={(value) => `${value.toFixed(0)}`}
                        dx={-10}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} KZ`, 'Price']}
                        labelStyle={{ color: '#78716c', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#10b981" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} 
                        activeDot={{ r: 6, fill: '#10b981', strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdraw && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowWithdraw(false); setWithdrawError(null); }}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 space-y-6 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center">
                  <h3 className="font-serif italic text-xl font-bold">Request Withdrawal</h3>
                  <button onClick={() => { setShowWithdraw(false); setWithdrawError(null); }} className="text-stone-400 hover:text-stone-600">×</button>
                </div>
                
                {withdrawError && (
                  <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-start gap-3">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-rose-800 font-medium leading-relaxed">{withdrawError}</p>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-stone-400 tracking-widest">Valor (KZ)</label>
                    <input type="number" className="w-full p-3 bg-stone-50 rounded-xl border border-stone-200" placeholder="0" id="withdrawAmount" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-stone-400 tracking-widest">Método</label>
                    <select className="w-full p-3 bg-stone-50 rounded-xl border border-stone-200" id="withdrawMethod">
                      <option value="iban">IBAN</option>
                      <option value="paypay_ao">PayPay AO</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-stone-400 tracking-widest">Detalhes (IBAN ou Conta PayPay AO)</label>
                    <input type="text" className="w-full p-3 bg-stone-50 rounded-xl border border-stone-200" placeholder="Insira os detalhes..." id="withdrawDetails" />
                  </div>
                  
                  <button 
                    onClick={async () => {
                      const amount = parseFloat((document.getElementById('withdrawAmount') as HTMLInputElement).value);
                      const method = (document.getElementById('withdrawMethod') as HTMLSelectElement).value;
                      const details = (document.getElementById('withdrawDetails') as HTMLInputElement).value;
                      
                      if (!profile || amount > profile.balanceKZ) {
                        setWithdrawError('Insufficient balance.');
                        return;
                      }
                      if (amount > (systemFinancials.playerDepositsMinusWithdrawals || 0)) {
                        setWithdrawError('Withdrawal temporarily unavailable.');
                        return;
                      }
                      if (!details) {
                        setWithdrawError('Please enter payment details.');
                        return;
                      }

                      const updates: Record<string, any> = {};
                      updates[`users/${user.uid}/balanceKZ`] = rtdbIncrement(-amount);
                      
                      const reqRef = push(ref(rtdb, `withdrawalRequests`));
                      updates[`withdrawalRequests/${reqRef.key}`] = {
                        id: reqRef.key,
                        userId: user.uid,
                        amountKZ: amount,
                        method,
                        details,
                        timestamp: Date.now(),
                        status: 'pending'
                      };
                      
                      const transRef = push(ref(rtdb, `transactions/${user.uid}`));
                      updates[`transactions/${user.uid}/${transRef.key}`] = {
                        id: transRef.key,
                        userId: user.uid,
                        type: 'withdrawal_request',
                        amountKZ: amount,
                        timestamp: Date.now(),
                        status: 'pending'
                      };

                      update(ref(rtdb), updates).then(() => {
                        setShowWithdraw(false);
                        setWithdrawError(null);
                      }).catch(err => handleRtdbError(err, OperationType.WRITE, `withdrawalRequests`));
                    }}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
                  >
                    Enviar Solicitação
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const AVAILABLE_ICONS = {
  animals: ['🐄', '🐖', '🐑', '🐓', '🐎', '🐐', '🦆', '🦃', '🐇', '🐝', '🐟', '🦐', '🦀', '🐃', '🐂', '🐪', '🐘', '🦒', '🦓', '🦙', '🦏', '🦛', '🦘', '🦥', '🦦', '🦫', '🦭', '🐋', '🐬', '🦈'],
  crops: ['🌽', '🌾', '🍅', '🥕', '🥔', '🥦', '🥬', '🍓', '🍇', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍈', '🍒', '🍑', '🍍', '🥥', '🥝', '🥑', '🍆', '🍄', '🥜', '🌶️', '🫑', '🥒', '🧄', '🧅', '🎃', '🍠', '🥐', '🥖'],
  special: ['🥛', '🧀', '🥩', '🥓', '🍗', '🥚', '🍯', '🧶', '🍞', '🍰', '🥧', '🍦', '🍨', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍷', '🍹', '🥤', '🧃', '🧉', '🍵', '☕', '🍺', '🍻', '🥂', '🍾', '🧂', '🧈']
};

function FarmSlotCard({ slot, onPlant, onHarvest, onFeed, onWater, commodities, inventory }: { slot: FarmSlot, onPlant: (id: string) => void, onHarvest: () => void, onFeed: (feedId: string) => void, onWater: () => void, commodities: any, inventory: Record<string, number> }) {
  const [progress, setProgress] = useState(0);
  const [showPlantMenu, setShowPlantMenu] = useState(false);
  const [showFeedMenu, setShowFeedMenu] = useState(false);
  const [showHarvestAnim, setShowHarvestAnim] = useState(false);
  const [showFeedAnim, setShowFeedAnim] = useState(false);
  const [particleOffsets, setParticleOffsets] = useState<{x: string, y: string}[]>([]);

  useEffect(() => {
    if (slot.status === 'growing' && slot.plantedAt && slot.harvestAt) {
      const interval = setInterval(() => {
        const p = getGrowthProgress(slot.plantedAt!, slot.harvestAt!);
        setProgress(p);
        if (p >= 100) {
          update(ref(rtdb, `farmSlots/${auth.currentUser!.uid}/${slot.id}`), {
            status: 'ready'
          });
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [slot.status, slot.plantedAt, slot.harvestAt, slot.id]);

  const itemInfo = commodities[slot.itemId as keyof typeof commodities];
  const animalItem: any = Object.values(commodities).find((c: any) => c.type === 'animal' && c.product === slot.itemId);
  const fallbackFoodId = animalItem?.consumes;
  const requiredFoodId = slot.requiredFoodId || fallbackFoodId;

  return (
    <div className="relative aspect-square">
      <motion.div 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (slot.status === 'empty') setShowPlantMenu(true);
          if (slot.status === 'hungry') setShowFeedMenu(true);
          if (slot.status === 'ready') {
            const offsets = [...Array(8)].map(() => ({
              x: `${-50 + (Math.random() - 0.5) * 300}%`,
              y: `${-50 + (Math.random() - 0.5) * 300}%`
            }));
            setParticleOffsets(offsets);
            setShowHarvestAnim(true);
            onHarvest();
            setTimeout(() => setShowHarvestAnim(false), 1000);
          }
        }}
        className={`w-full h-full rounded-3xl border-2 flex flex-col items-center justify-center p-4 cursor-pointer transition-all ${
          slot.status === 'empty' ? 'bg-stone-200/50 border-dashed border-stone-300' :
          slot.status === 'growing' ? 'bg-amber-50 border-amber-200' :
          slot.status === 'hungry' ? 'bg-rose-50 border-rose-200' :
          'bg-emerald-50 border-emerald-300 shadow-lg shadow-emerald-100'
        }`}
      >
        {slot.status === 'empty' && (
          <div className="text-stone-400 flex flex-col items-center gap-1 text-center px-2">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-1 ${slot.area === 'curral' ? 'bg-blue-50 text-blue-400' : 'bg-amber-50 text-amber-400'}`}>
              {slot.area === 'curral' ? <PawPrint className="w-6 h-6" /> : <Sprout className="w-6 h-6" />}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest leading-tight">
              {slot.area === 'curral' ? 'New Corral' : 'New Crop'}
            </span>
            <span className="text-[7px] uppercase font-bold text-stone-300">
              {slot.area === 'curral' ? 'Raise Animals' : 'Plant Seeds'}
            </span>
          </div>
        )}

        {slot.status === 'growing' && !slot.watered && (
          <button 
            onClick={(e) => { e.stopPropagation(); onWater(); }}
            className="absolute top-2 right-2 p-2 bg-blue-500 text-white rounded-full z-10"
          >
            <Droplets className="w-4 h-4" />
          </button>
        )}

        {slot.status === 'growing' && (
          <div className="flex flex-col items-center gap-2 w-full">
            <div className="relative">
              {itemInfo?.icon ? (
                <motion.div 
                  animate={{ 
                    scale: [1, 1.05, 1],
                    rotate: [0, -2, 2, 0]
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-2xl"
                >
                  {itemInfo.icon}
                </motion.div>
              ) : slot.type === 'animal' ? (
                <motion.div 
                  animate={{ 
                    scale: [1, 1.05, 1],
                    rotate: [0, -2, 2, 0]
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-2xl"
                >
                  🐄
                </motion.div>
              ) : (
                <Sprout className="w-8 h-8 text-amber-600 animate-pulse" />
              )}
              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm">
                <Timer className="w-3 h-3 text-amber-500" />
              </div>
            </div>
            <div className="w-full bg-stone-200 h-1 rounded-full overflow-hidden">
              <motion.div 
                className="bg-amber-500 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-center w-full">
              <p className="text-[9px] font-bold text-amber-700 uppercase leading-tight truncate">{itemInfo?.name}</p>
              {slot.area === 'curral' && (
                <p className="text-[7px] text-amber-600/60 font-bold uppercase mt-0.5">
                  Needs: {requiredFoodId ? (commodities[requiredFoodId]?.name || 'Feed') : 'Feed'}
                </p>
              )}
            </div>
          </div>
        )}

        {slot.status === 'hungry' && (
          <div className="flex flex-col items-center gap-1 w-full px-2">
            <motion.div 
              animate={{ 
                y: [0, -4, 0],
                rotate: [-5, 5, -5]
              }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-2xl grayscale"
            >
              {itemInfo?.icon || itemInfo?.emoji || '🐄'}
            </motion.div>
            <div className="bg-rose-500 text-white text-[7px] px-2 py-0.5 rounded-full font-bold uppercase shadow-lg shadow-rose-200">Hungry</div>
            <div className="text-center">
              <p className="text-[9px] font-bold text-rose-700 uppercase leading-tight">{itemInfo?.name}</p>
              <div className="mt-1 p-1 bg-white/50 rounded-lg border border-rose-100">
                <p className="text-[7px] text-stone-400 uppercase font-bold">Use:</p>
                <p className="text-[8px] font-bold text-rose-600 truncate">
                  {requiredFoodId ? (commodities[requiredFoodId]?.name || 'Feed') : 'Feed'}
                </p>
              </div>
            </div>
          </div>
        )}

        {slot.status === 'ready' && (
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="flex flex-col items-center gap-2"
          >
            <motion.div 
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="bg-white p-3 rounded-2xl shadow-md"
            >
              {itemInfo?.icon ? (
                <span className="text-3xl">{itemInfo.icon}</span>
              ) : slot.type === 'animal' ? (
                <div className="text-2xl">🥛</div>
              ) : (
                <Package className="w-8 h-8 text-emerald-600" />
              )}
            </motion.div>
            <span className="text-[10px] font-bold text-emerald-700 uppercase">Harvest {itemInfo?.name}</span>
            {slot.type === 'animal' && (
              <span className="text-[8px] text-stone-400 font-bold">Lives: {slot.harvestsRemaining}</span>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Harvest Animation */}
      <AnimatePresence>
        {showHarvestAnim && (
          <>
            {/* Particles */}
            {particleOffsets.map((offset, i) => (
              <motion.div
                key={`particle-${i}`}
                initial={{ opacity: 1, scale: 0, x: "-50%", y: "-50%", left: "50%", top: "50%" }}
                animate={{ 
                  opacity: [1, 0],
                  scale: [0, 1.2, 0.5],
                  x: ["-50%", offset.x],
                  y: ["-50%", offset.y],
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute z-40 pointer-events-none"
              >
                <Sparkles className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              </motion.div>
            ))}

            {/* Flying Item */}
            <motion.div
              initial={{ opacity: 1, scale: 1, x: "-50%", y: "-50%", left: "50%", top: "50%" }}
              animate={{ 
                opacity: [1, 1, 0],
                scale: [1, 1.4, 0.4],
                y: ["-50%", "-150%", "-600%"],
                x: ["-50%", "-100%", "100%"],
                rotate: [0, 15, -15, 0]
              }}
              transition={{ duration: 0.8, ease: "backOut" }}
              className="absolute z-50 pointer-events-none"
            >
              <div className="bg-white p-3 rounded-2xl shadow-2xl border-2 border-emerald-400 flex items-center justify-center">
                <Package className="w-8 h-8 text-emerald-600" />
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.8, 0], opacity: [0, 0.5, 0] }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-emerald-400 rounded-full blur-xl"
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Feed Animation */}
      <AnimatePresence>
        {showFeedAnim && (
          <motion.div
            initial={{ opacity: 1, scale: 0.5, y: -100, x: "-50%", left: "50%" }}
            animate={{ 
              opacity: [1, 1, 0],
              scale: [0.5, 1.2, 1],
              y: [-100, 0],
              rotate: [0, -20, 20, 0]
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute z-50 pointer-events-none top-1/2"
          >
            <div className="bg-amber-100 p-2 rounded-xl shadow-lg border border-amber-200">
              <div className="text-xl">📦</div>
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0, 0.3, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="absolute inset-0 bg-amber-400 rounded-full blur-lg"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed Menu */}
      <AnimatePresence>
        {showFeedMenu && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute inset-0 z-20 bg-white rounded-3xl shadow-xl border border-stone-200 p-2 overflow-y-auto no-scrollbar"
          >
            <div className="grid grid-cols-1 gap-1">
              <div className="mb-2 text-center border-b border-stone-100 pb-1">
                <p className="text-[8px] font-bold text-stone-400 uppercase">Feed Needed:</p>
                <p className="text-[10px] font-bold text-emerald-600 uppercase">
                  {requiredFoodId ? (commodities[requiredFoodId]?.name || 'Feed') : 'Feed'}
                </p>
              </div>
              {Object.entries(commodities).filter(([id, data]: [string, any]) => {
                const matchesConsumes = id === requiredFoodId;
                const hasInventory = (inventory[id] || 0) > 0;
                return matchesConsumes && hasInventory;
              }).length === 0 ? (
                <div className="flex flex-col items-center justify-center p-4 text-center">
                  <Package className="w-6 h-6 text-stone-300 mb-1" />
                  <p className="text-[8px] font-bold text-stone-400 uppercase">No {requiredFoodId ? (commodities[requiredFoodId]?.name || 'Feed') : 'Feed'}</p>
                  <p className="text-[6px] text-stone-300 mt-1 uppercase">ID: {requiredFoodId || 'Not defined'}</p>
                  <p className="text-[6px] text-stone-300 uppercase">Stock: {requiredFoodId ? (inventory[requiredFoodId] || 0) : 0}</p>
                </div>
              ) : (
                Object.entries(commodities).filter(([id, data]: [string, any]) => {
                  const matchesConsumes = id === requiredFoodId;
                  const hasInventory = (inventory[id] || 0) > 0;
                  return matchesConsumes && hasInventory;
                }).map(([id, data]: [string, any]) => (
                  <button
                    key={id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFeedAnim(true);
                      onFeed(id);
                      setShowFeedMenu(false);
                      setTimeout(() => setShowFeedAnim(false), 1000);
                    }}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-stone-50 transition-colors border border-transparent hover:border-stone-100"
                  >
                    <div className="w-6 h-6 bg-stone-100 rounded flex items-center justify-center text-[10px]">📦</div>
                    <div className="flex-1 text-left">
                      <p className="text-[10px] font-bold leading-none">{data.name}</p>
                      <p className="text-[8px] text-emerald-600 font-bold">{inventory[id]} avail.</p>
                    </div>
                  </button>
                ))
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); setShowFeedMenu(false); }}
                className="text-[8px] font-bold text-stone-400 uppercase mt-1 py-1 hover:bg-stone-50 rounded-lg"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plant Menu */}
      <AnimatePresence>
        {showPlantMenu && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute inset-0 z-20 bg-white rounded-3xl shadow-xl border border-stone-200 p-2 overflow-y-auto no-scrollbar"
          >
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(commodities).filter(([id, data]: [string, any]) => (slot.area === 'curral' ? data.type === 'animal' : data.type === 'seed') && (inventory[id] || 0) > 0).length === 0 ? (
                <div className="col-span-2 flex flex-col items-center justify-center p-4 text-center">
                  <Package className="w-6 h-6 text-stone-300 mb-1" />
                  <p className="text-[8px] font-bold text-stone-400 uppercase">{slot.area === 'curral' ? 'No Animals' : 'No Seeds'}</p>
                </div>
              ) : (
                Object.entries(commodities).filter(([id, data]: [string, any]) => (slot.area === 'curral' ? data.type === 'animal' : data.type === 'seed') && (inventory[id] || 0) > 0).map(([id, data]: [string, any]) => (
                  <button
                    key={id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlant(id);
                      setShowPlantMenu(false);
                    }}
                    className="flex flex-col items-center justify-center p-1 rounded-xl hover:bg-stone-50 transition-colors border border-transparent hover:border-stone-100"
                  >
                    <span className="text-[10px] font-bold">{data.name}</span>
                    <span className="text-[8px] text-emerald-600 font-bold">
                      {inventory[id]} avail.
                    </span>
                  </button>
                ))
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); setShowPlantMenu(false); }}
                className="col-span-2 text-[8px] font-bold text-stone-400 uppercase mt-1 py-1 hover:bg-stone-50 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
