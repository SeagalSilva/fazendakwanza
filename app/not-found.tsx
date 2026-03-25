import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-stone-100 p-4 text-center">
      <h2 className="text-2xl font-bold text-stone-900 mb-4">Página Não Encontrada</h2>
      <p className="text-stone-600 mb-8">Desculpe, não conseguimos encontrar a página que você está procurando.</p>
      <Link 
        href="/"
        className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all"
      >
        Voltar para a Fazenda
      </Link>
    </div>
  );
}
