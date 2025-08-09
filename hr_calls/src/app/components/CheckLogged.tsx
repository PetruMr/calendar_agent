// Componente per verificare se l'utente è loggato
// Spesso utilizzato prima che la pagina venga renderizzata, in modo da evitare di mostrare pagine protette a utenti non autenticati
// Fa una richiesta al server per verificare il token JWT. Se la richiesta va a buon fine, l'utente è autenticato e vengono salvati
// i dati dell'utente e lo stato di login. Se la richiesta fallisce, l'utente non è autenticato.

"use client";
import { useEffect, useState } from "react";

export default function useCheckLogged() {
  const [isTokenLoading, setIsTokenLoading] = useState(true);
  const [loginStatus, setLoginStatus] = useState(false);
  const [userData, setUserData] = useState({
    _id: null,
    username: null,
    tipo: "user",
    email: null,
    nome: null,
    googleCalendarLinked: false,
  });

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setIsTokenLoading(true);
      try {
        const res = await fetch("/api/auth/user/tokenTest", { method: "POST" }); // cookie HttpOnly inviato automaticamente
        if (!alive) return;

        if (res.ok) {
          const data = await res.json();
          setUserData(data.userData);
          setLoginStatus(true);
        } else {
          setLoginStatus(false);
        }
      } catch {
        if (!alive) return;
        setLoginStatus(false);
      } finally {
        if (alive) setIsTokenLoading(false);
      }
    };

    run();
    return () => { alive = false; };
  }, []);

  return { isTokenLoading, loginStatus, userData };
}
