// /access
// Pagina di accesso e registrazione per gli utenti

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Semplice regex per validare le email
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

// I componenti per il form di accesso e registrazione
// Questi componenti sono utilizzati per mostrare i campi di input e gestire
type FieldProps = {
  // Proprietà del campo di input
  label: string;
  name: "username" | "email" | "password" | "nome";
  type?: "text" | "password" | "email" | "text";
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  autoComplete?: string;
  hidden?: boolean;

  // Gestione dello stato del campo
  value: string;
  error?: string;
  touched?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;

  showPassword?: boolean;
  onTogglePassword?: () => void;
};

function Field({
  label, name, type = "text", placeholder, maxLength, minLength, autoComplete, hidden,
  value, error, touched, onChange, onBlur, showPassword, onTogglePassword
}: FieldProps) {
  if (hidden) return null;
  const showError = !!error && (touched || !!value);
  const inputId = `${name}-input`;
  const descId = `${name}-error`;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div
        className={`relative flex items-center rounded-2xl border bg-white/60 backdrop-blur-sm transition-all ${
          showError ? "border-red-400 ring-2 ring-red-200" : "border-gray-200 focus-within:ring-2 focus-within:ring-gray-900"
        }`}
      >
        <input
          id={inputId}
          type={name === "password" && showPassword ? "text" : type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-3 outline-none"
          aria-invalid={showError || undefined}
          aria-describedby={showError ? descId : undefined}
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          required={name === "email" ? undefined : true}
        />
        {name === "password" && (
          <button
            type="button"
            className="absolute inset-y-0 right-2 my-1 rounded-md px-2 text-xs text-gray-600 transition hover:bg-gray-100"
            onClick={onTogglePassword}
            aria-label={showPassword ? "Nascondi password" : "Mostra password"}
          >
            {showPassword ? "Nascondi" : "Mostra"}
          </button>
        )}
      </div>
      {showError && (
        <p id={descId} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Il componente principale della pagina di accesso/registrazione
export default function AccessPage() {
  // Stato per gestire il tipo di form (login o registrazione)
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ username: "", email: "", password: "", nome: "" });
  const [touched, setTouched] = useState<{ [K in keyof typeof form]?: boolean }>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  
  // Stato per gestire lo stato di caricamento, errori del server e visibilità della password
  const [loading, setLoading] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  // Funzione per validare i campi del form
  const validate = (draft = form) => {
    const next: Partial<Record<keyof typeof form, string>> = {};

    const username = draft.username.trim();
    if (!username) next.username = "Username non può essere vuoto";
    else if (username.length >= 30) next.username = "Deve essere sotto i 30 caratteri"; // Scelta arbitraria

    const pwd = draft.password;
    if (!pwd) next.password = "Password non può essere vuota";
    else if (pwd.length < 8 || pwd.length > 24) next.password = "8-24 caratteri richiesti";

    if (mode === "register") {
      const email = draft.email.trim();
      if (!email) next.email = "Email non può essere vuota";
      else if (!emailRegex.test(email)) next.email = "Email non valida";
    }

    return next;
  };

  // Calcola se ci sono errori nel form
  // Se ci sono errori, il pulsante di invio sarà disabilitato
  const hasErrors = useMemo(() => {
    const errs = validate();
    return Object.keys(errs).length > 0;
  }, [form, mode]);

  // Effetto per aggiornare gli errori del campo quando il modo cambia
  // Questo assicura che gli errori siano aggiornati quando si passa da login a registrazione o viceversa
  useEffect(() => {
    setFieldErrors(validate());
  }, [mode]);

  // Gestori per gli eventi di input e submit
  // Questi gestori aggiornano lo stato del form e validano i campi
  const onChange = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((prev) => {
      const draft = { ...prev, [key]: value };
      const errs = validate(draft);
      setFieldErrors(errs);
      return draft;
    });
  };

  // Gestore per il blur degli input, per mostrare gli errori dopo che l'utente ha interagito con il campo
  // Questo aiuta a evitare di mostrare errori prima che l'utente abbia iniziato a digitare
  const onBlur = (key: keyof typeof form) => () => setTouched((t) => ({ ...t, [key]: true }));

  // Gestore per l'invio del form
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerErr(null);

    const errs = validate();
    setFieldErrors(errs);
    setTouched({ username: true, password: true, email: mode === "register" ? true : touched.email || false, nome: mode === "register" ? true : touched.nome || false });
    if (Object.keys(errs).length > 0) return; // Previene l'invio se ci sono errori

    // Se il form è valido, invia i dati al server
    // Utilizza il metodo appropriato in base al tipo di form (login o registrazione
    setLoading(true);
    try {
      const payload =
        mode === "login"
          ? { username: form.username.trim(), password: form.password }
          : { username: form.username.trim(), password: form.password, email: form.email.trim(), nome: form.nome.trim() };

      const res = await fetch(`/api/auth/user/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Qualcosa è andato storto");

      router.replace("/");
      router.refresh();
    } catch (e: string | unknown) {
      if (typeof e === "string") {
        setServerErr(e);
      } else {
        setServerErr((e as Error).message || "Errore sconosciuto");
        console.error("Errore: ", e);
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <main className="min-h-screen w-full relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-rose-50 via-white to-indigo-50" />
      <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[120vh] w-[120vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.06),transparent_60%)]" />

      <section className="mx-auto flex max-w-md flex-col items-center justify-center p-6 md:p-8">
        <div className="w-full">
          {/* Header */}
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Benvenuto su <span className="text-blue-400">HR Calls</span></h1>
            <p className="mt-1 text-sm text-gray-600">
              {mode === "login" ? "Esegui l'accesso da recuiter per continuare" : <span>Crea un account da recuiter <span className="text-gray-400 font-bold italic">(feature per testing)</span></span>}
            </p>
          </div>

          {/* Tabs */}
          <div className="mb-4 rounded-2xl border bg-white/70 p-1 backdrop-blur">
            <div className="relative grid grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`z-10 px-4 py-2 text-sm md:text-base transition ${
                  mode === "login" ? "font-semibold text-gray-900" : "text-gray-500 hover:text-gray-800"
                }`}
                aria-current={mode === "login" ? "page" : undefined}
              >
                Accedi
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`z-10 px-4 py-2 text-sm md:text-base transition ${
                  mode === "register" ? "font-semibold text-gray-900" : "text-gray-500 hover:text-gray-800"
                }`}
                aria-current={mode === "register" ? "page" : undefined}
              >
                Registrati
              </button>
              {/* Indicatore al di sotto di ciò che viene selezionato */}
              <span
                className="pointer-events-none absolute bottom-0 left-0 h-[3px] w-1/4 rounded-full bg-gray-400 transition-transform duration-300"
                style={{ transform: mode === "login" ? "translateX(50%)" : "translateX(250%)" }}
              />
            </div>
          </div>

          {/* Card */}
          <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-3xl border bg-white/80 p-5 shadow-sm backdrop-blur md:p-6">
            <Field
              label="Username"
              name="username"
              value={form.username}
              error={fieldErrors.username}
              touched={touched.username}
              onChange={onChange("username")}
              onBlur={onBlur("username")}
              placeholder="Il tuo username..."
              maxLength={29}
              autoComplete="username"
            />

            {mode === "register" && (
              <>
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  value={form.email}
                  error={fieldErrors.email}
                  touched={touched.email}
                  onChange={onChange("email")}
                  onBlur={onBlur("email")}
                  placeholder="tuaemail@esempio.com"
                  autoComplete="email"
                />
                <Field
                  label="Nome"
                  name="nome"
                  value={form.nome}
                  error={fieldErrors.nome}
                  touched={touched.nome}
                  onChange={onChange("nome")}
                  onBlur={onBlur("nome")}
                  placeholder="Il tuo nome"
                  maxLength={50}
                />
              </>
            )}

            <Field
              label="Password"
              name="password"
              type="password"
              value={form.password}
              error={fieldErrors.password}
              touched={touched.password}
              onChange={onChange("password")}
              onBlur={onBlur("password")}
              placeholder="••••••••"
              minLength={8}
              maxLength={24}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(s => !s)}
            />



            {serverErr && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {serverErr}
              </div>
            )}

            <br></br>

            <button
              type="submit"
              disabled={loading || hasErrors}
              className="group relative w-full rounded-2xl bg-gray-900 px-4 py-3 font-medium text-white transition hover:scale-[1.01] active:scale-[.99] disabled:opacity-60"
            >
              <span className="inline-flex items-center justify-center gap-2">
                {loading && (
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {loading ? (mode === "login" ? "Accedendo..." : "Registrando...") : mode === "login" ? "Accedi" : "Registrati"}
              </span>
            </button>

            <p className="pt-1 text-center text-xs text-gray-500">Continuando accetti le <a className="text-blue-500" href="conditions">condizioni d&#39uso</a></p>
          </form>
        </div>
      </section>
    </main>
  );
}
