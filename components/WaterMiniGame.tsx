import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Droplets, Play, Trophy, Timer } from 'lucide-react';
import { ref, update, increment as rtdbIncrement } from 'firebase/database';
import { rtdb } from '../lib/firebase';

interface Drop {
  id: number;
  x: number;
  y: number;
  speed: number;
}

export default function WaterMiniGame({ user, currentWater }: { user: any, currentWater: number }) {
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'ended'>('idle');
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [drops, setDrops] = useState<Drop[]>([]);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const spawnIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startGame = () => {
    setScore(0);
    scoreRef.current = 0;
    setTimeLeft(20);
    setDrops([]);
    setGameState('playing');
    nextIdRef.current = 0;
  };

  const endGame = useCallback(() => {
    setGameState('ended');
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    // Save water to database
    if (scoreRef.current > 0) {
      update(ref(rtdb, `users/${user.uid}/water`), {
        balance: rtdbIncrement(scoreRef.current)
      }).catch(err => console.error('Failed to save water:', err));
    }
  }, [user.uid]);

  const collectDrop = (id: number) => {
    setScore(prev => {
      const newScore = prev + 1;
      scoreRef.current = newScore;
      return newScore;
    });
    setDrops(prev => prev.filter(d => d.id !== id));
  };

  // Game Loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    // Timer
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Spawn drops
    spawnIntervalRef.current = setInterval(() => {
      if (!gameAreaRef.current) return;
      const width = gameAreaRef.current.clientWidth;
      const newDrop: Drop = {
        id: nextIdRef.current++,
        x: Math.random() * (width - 40),
        y: -50,
        speed: 2 + Math.random() * 3
      };
      setDrops(prev => [...prev, newDrop]);
    }, 600);

    // Move drops
    const moveDrops = () => {
      setDrops(prev => {
        const nextDrops = prev
          .map(d => ({ ...d, y: d.y + d.speed }))
          .filter(d => d.y < 500); // Remove drops that fall off screen
        return nextDrops;
      });
      animationFrameRef.current = requestAnimationFrame(moveDrops);
    };
    animationFrameRef.current = requestAnimationFrame(moveDrops);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [gameState, endGame]);

  return (
    <div className="p-6 bg-white rounded-[2.5rem] border border-stone-100 shadow-xl max-w-2xl mx-auto overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif italic text-3xl font-bold text-stone-900">Coleta de Água</h2>
          <p className="text-stone-400 text-sm">Capture as gotas de chuva para sua fazenda!</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-blue-50 px-4 py-2 rounded-2xl flex items-center gap-2 border border-blue-100">
            <Droplets className="w-5 h-5 text-blue-500" />
            <span className="font-mono font-bold text-blue-700">{score}</span>
          </div>
          <div className="bg-stone-50 px-4 py-2 rounded-2xl flex items-center gap-2 border border-stone-100">
            <Timer className="w-5 h-5 text-stone-500" />
            <span className="font-mono font-bold text-stone-700">{timeLeft}s</span>
          </div>
        </div>
      </div>

      <div 
        ref={gameAreaRef}
        className="relative h-[400px] bg-gradient-to-b from-blue-50/30 to-stone-50 rounded-[2rem] border border-stone-100 overflow-hidden cursor-crosshair"
      >
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-sm z-10">
            <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-200 mb-6 animate-bounce">
              <Droplets className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-stone-900 mb-2">Pronto para coletar?</h3>
            <p className="text-stone-500 text-sm mb-8 text-center max-w-[200px]">
              Clique nas gotas azuis que caem do céu para encher seu estoque.
            </p>
            <div className="mb-8 p-3 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
              <Droplets className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-bold text-blue-700">Estoque Atual: {currentWater} unidades</span>
            </div>
            <button 
              onClick={startGame}
              className="px-8 py-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-stone-800 transition-all shadow-lg shadow-stone-200"
            >
              <Play className="w-5 h-5 fill-current" /> Começar Jogo
            </button>
          </div>
        )}

        {gameState === 'playing' && (
          <AnimatePresence>
            {drops.map((drop) => (
              <motion.button
                key={drop.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.5 }}
                className="absolute p-3 bg-blue-500 rounded-full text-white shadow-lg shadow-blue-200 hover:bg-blue-400 transition-colors"
                style={{ left: drop.x, top: drop.y }}
                onPointerDown={() => collectDrop(drop.id)}
              >
                <Droplets className="w-6 h-6" />
              </motion.button>
            ))}
          </AnimatePresence>
        )}

        {gameState === 'ended' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md z-10">
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-200 mb-6">
              <Trophy className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-stone-900 mb-1">Excelente Coleta!</h3>
            <p className="text-stone-500 mb-8">Você conseguiu <span className="font-bold text-blue-600">{score} unidades</span> de água.</p>
            <div className="flex gap-3">
              <button 
                onClick={startGame}
                className="px-8 py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg shadow-stone-200"
              >
                Jogar Novamente
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
          <Droplets className="w-6 h-6" />
        </div>
        <p className="text-xs text-amber-800 leading-relaxed">
          <strong>Dica:</strong> Use a água coletada para acelerar o crescimento das suas plantações na aba <strong>Fazenda</strong>. Cada gota reduz o tempo restante!
        </p>
      </div>
    </div>
  );
}
