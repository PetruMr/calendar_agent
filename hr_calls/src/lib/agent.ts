// /lib/agent.ts

import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

// Questo file contiene la logica per le funzionalità automatizzate per l'organizzazione delle chiamate:
// - Mandare email per confermare gli orari di disponibilità per la chiamata ogni 8 ore
// - Dopo 24 ore, se non è stata ancora organizzata, cancellare la chiamata
// - Dopo che tutte le risposte sono state ricevute, utilizzare Google Calendar API + Le disponibilità ricevute per la generazione dello slot di chiamata
// - Generazione del link di Google Meet, del link per aggiungere l'evento al calendario e invio dell'email di conferma

// La funzione principale è chiamata `agentEntryPoint` ed è eseguita quando viene richiesta l 'organizzazione di una chiamata.
// Viene eseguita con il parametro `callId` che identifica la chiamata da organizzare.
export async function agent_CallCreation_EntryPoint(callId: string) {
    // Inizio della logica per l'organizzazione della chiamata

    // Per prima cosa, si recuperano i dettagli della chiamata.
    const { data: callData, error: callError } = await supabase
        .from("calls")
        .select("id, data_creazione, data_call, data_deadline, stato_avanzamento, tipo, durata, note, link_meet, titolo")
        .eq("id", callId)
        .single();
    if (callError || !callData) {
        console.error("Errore nel recupero della chiamata:", callError);
        return;
    }

    // Si inizia ricercando i partecipanti esterni, utilizzando la tabella "partecipanti" che contiene l'id della chiamata e l'email dei partecipanti.
    const { data: externalParticipants, error: participantsError } = await supabase
        .from("partecipanti")
        .select("id, nome, email, call_id, stato, token, created_at, updated_at")
        .eq("call_id", callId)
    if (participantsError) {
        console.error("Errore nel recupero dei partecipanti esterni:", participantsError);
        return;
    }
    
    

    // Se non vi sono partecipanti esterni, allora si procede direttamente con l'organizzazione della chiamata, chiamando la funzione `agent_organizeCall`
    if (externalParticipants.length === 0) {
        // Qui si può chiamare la funzione per organizzare la chiamata, ad esempio:
        // await agent_organizeCall(callId, callData, []);
        console.log("Nessun partecipante esterno, procedo con l'organizzazione della chiamata");
    }

    // Se invece vi sono partecipanti esterni, si inizia l'invio delle email per confermare le disponibilità attraverso la funzione `agent_sendAvailabilityEmails`
    console.log("Invio email per confermare le disponibilità ai partecipanti esterni");
    await agent_sendAvailabilityEmails(callData, externalParticipants);
}

// Funzione per inviare email ai partecipanti esterni per confermare le disponibilità
// L'email contiene 
async function agent_sendAvailabilityEmails(callData: {
    id: any;
    data_creazione: any;
    data_call: any ;
    data_deadline: any;
    stato_avanzamento: any;
    tipo: any;
    durata: any;
    note: any;
    link_meet: any;
    titolo: any;
}, participants: { id: any; nome: any; email: any; token: any; call_id: any; stato:any; created_at:any; updated_at:any }[]) {
    for (const participant of participants) {
        const emailContent = `
            Ciao ${participant.nome || "partecipante"},
            Ti invitiamo a confermare la tua disponibilità per la chiamata "${callData.titolo}".
            Dettagli della chiamata:
            - Data di creazione: ${callData.data_creazione}
            - Data della chiamata: ${callData.data_call || "Non ancora programmata"}
            - Scadenza per la risposta: ${callData.data_deadline || "N/A"}
            - Durata prevista: ${callData.durata} minuti
            - Note: ${callData.note || "Nessuna nota"}
            
            Per favore, rispondi a questa email con le tue disponibilità.
        `;

        try {
            await sendEmail(participant.email, "Conferma disponibilità chiamata", emailContent);
            console.log(`Email inviata a ${participant.email}`);
        } catch (error) {
            console.error(`Errore nell'invio dell'email a ${participant.email}:`, error);
        }
    }
}