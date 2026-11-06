// Band UI strings (EN / FR / ES). Shared by the /band client and the /api/alert server route.
import type { Language } from "@/lib/types";

export const LANGUAGES: Language[] = ["en", "fr", "es"];

export interface BandStrings {
  loading: string;
  missingResident: string;
  notFound: string;
  offline: string;
  start: string;
  startHint: string;
  room: string;
  bpm: string;
  help: string;
  pain: string;
  bathroom: string;
  water: string;
  needHelp: string;
  sending: string;
  sendFailed: string;
  waitMoment: string;
  helpComing: string;
  /** {nurse} = nurse name */
  onTheWay: string;
  /** {time} = m:ss countdown */
  eta: string;
  anyMoment: string;
  stayCalm: string;
  areYouOk: string;
  fallDetected: string;
  imOk: string;
  /** {s} = seconds left */
  callingIn: string;
  listening: string;
  /** Add-to-Home-Screen hint on the Start screen */
  installTitle: string;
  installIos: string;
  installButton: string;
  /** Help overlay: Back + "I'm OK – cancel" with a confirm step */
  back: string;
  cancelRequest: string;
  cancelConfirm: string;
  yes: string;
  no: string;
  nurseWillCheck: string;
  requestCancelled: string;
  cancelFailed: string;
}

export const STRINGS: Record<Language, BandStrings> = {
  en: {
    loading: "Loading…",
    missingResident: "No resident selected.",
    notFound: "Resident not found.",
    offline: "Connection lost — retrying…",
    start: "Start Kijo",
    startHint: "Tap to turn on your band",
    room: "Room",
    bpm: "bpm",
    help: "HELP",
    pain: "Pain",
    bathroom: "Bathroom",
    water: "Water",
    needHelp: "Help",
    sending: "Sending…",
    sendFailed: "Couldn't send. Please try again.",
    waitMoment: "Please wait a moment.",
    helpComing: "Help is coming",
    onTheWay: "{nurse} is on the way",
    eta: "{time}",
    anyMoment: "Any moment now",
    stayCalm: "Stay where you are. Someone is coming.",
    areYouOk: "Are you OK?",
    fallDetected: "A fall was detected.",
    imOk: "I'm OK",
    callingIn: "Calling for help in {s}s",
    listening: "Listening…",
    installTitle: "Keep Kijo Band on your home screen",
    installIos: "Tap Share, then “Add to Home Screen”.",
    installButton: "Install app",
    back: "Back",
    cancelRequest: "I'm OK – cancel",
    cancelConfirm: "Cancel your request?",
    yes: "Yes",
    no: "No",
    nurseWillCheck: "Your nurse will still check on you.",
    requestCancelled: "Request cancelled",
    cancelFailed: "Couldn't cancel. Please try again.",
  },
  fr: {
    loading: "Chargement…",
    missingResident: "Aucun résident sélectionné.",
    notFound: "Résident introuvable.",
    offline: "Connexion perdue — nouvelle tentative…",
    start: "Démarrer Kijo",
    startHint: "Touchez pour activer votre bracelet",
    room: "Chambre",
    bpm: "bpm",
    help: "AIDE",
    pain: "Douleur",
    bathroom: "Toilettes",
    water: "Eau",
    needHelp: "Aide",
    sending: "Envoi…",
    sendFailed: "Échec de l'envoi. Réessayez.",
    waitMoment: "Un instant, s'il vous plaît.",
    helpComing: "L'aide arrive",
    onTheWay: "{nurse} arrive",
    eta: "{time}",
    anyMoment: "D'un instant à l'autre",
    stayCalm: "Restez où vous êtes. Quelqu'un arrive.",
    areYouOk: "Ça va ?",
    fallDetected: "Une chute a été détectée.",
    imOk: "Ça va",
    callingIn: "Appel à l'aide dans {s} s",
    listening: "À l'écoute…",
    installTitle: "Gardez Kijo Band sur votre écran d'accueil",
    installIos: "Touchez Partager, puis « Sur l'écran d'accueil ».",
    installButton: "Installer l'app",
    back: "Retour",
    cancelRequest: "Ça va – annuler",
    cancelConfirm: "Annuler votre demande ?",
    yes: "Oui",
    no: "Non",
    nurseWillCheck: "L’équipe soignante viendra quand même vous voir.",
    requestCancelled: "Demande annulée",
    cancelFailed: "Échec de l'annulation. Réessayez.",
  },
  es: {
    loading: "Cargando…",
    missingResident: "No hay residente seleccionado.",
    notFound: "Residente no encontrado.",
    offline: "Sin conexión — reintentando…",
    start: "Iniciar Kijo",
    startHint: "Toque para activar su pulsera",
    room: "Habitación",
    bpm: "lpm",
    help: "AYUDA",
    pain: "Dolor",
    bathroom: "Baño",
    water: "Agua",
    needHelp: "Ayuda",
    sending: "Enviando…",
    sendFailed: "No se pudo enviar. Inténtelo de nuevo.",
    waitMoment: "Espere un momento, por favor.",
    helpComing: "La ayuda está en camino",
    onTheWay: "{nurse} va en camino",
    eta: "{time}",
    anyMoment: "En cualquier momento",
    stayCalm: "Quédese donde está. Alguien viene.",
    areYouOk: "¿Está bien?",
    fallDetected: "Se detectó una caída.",
    imOk: "Estoy bien",
    callingIn: "Pidiendo ayuda en {s} s",
    listening: "Escuchando…",
    installTitle: "Tenga Kijo Band en su pantalla de inicio",
    installIos: "Toque Compartir y luego «Añadir a pantalla de inicio».",
    installButton: "Instalar app",
    back: "Volver",
    cancelRequest: "Estoy bien – cancelar",
    cancelConfirm: "¿Cancelar su solicitud?",
    yes: "Sí",
    no: "No",
    nurseWillCheck: "El personal de enfermería vendrá a verle de todos modos.",
    requestCancelled: "Solicitud cancelada",
    cancelFailed: "No se pudo cancelar. Inténtelo de nuevo.",
  },
};

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/**
 * Nurse names are stored as "Nurse Ana". English keeps the title; FR/ES use the first name only,
 * which avoids guessing a gendered title (Infirmier/Infirmière, Enfermero/Enfermera).
 */
export function nurseDisplayName(name: string, lang: Language): string {
  return lang === "en" ? name : name.replace(/^Nurse\s+/i, "");
}
