import { NextResponse } from 'next/server';

// Test per API su dev server
export async function GET(request: Request) {
  // Esempio di dati da ritornare come JSON
  const users = [
    { id: 1, name: 'Mario Rossi' },
    { id: 2, name: 'Luca Bianchi' },
  ];

  return NextResponse.json({ users });
}