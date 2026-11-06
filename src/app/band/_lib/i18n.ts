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
  pain: string;
  bathroom: string;
  water: string;
  needHelp: string;
  sending: string;
  sendFailed: string;
  /** within the 10 s limit: the request already went out */
  alreadySent: string;
  helpComing: string;
  /** {nurse} = nurse name */
  onTheWay: string;
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
  /** Help sheet: "I'm OK" → "Cancel your request?" Yes, cancel / No */
  back: string;
  cancelRequest: string;
  cancelConfirm: string;
  no: string;
  nurseWillCheck: string;
  requestCancelled: string;
  cancelFailed: string;
  /** Camera pulse check (bonus) */
  checkPulse: string;
  pulseInstructions: string;
  pulseNoTorch: string;
  pulseStart: string;
  pulseCover: string;
  pulseHoldStill: string;
  pulseSignal: string;
  qualityGood: string;
  qualityFair: string;
  qualityPoor: string;
  pulseTryAgain: string;
  pulseSent: string;
  pulseDisclaimer: string;
  pulseNoCamera: string;
  pulseDone: string;
  pulseRetry: string;
  /** Simplified band: Talk button, corner language icon, banner sheet */
  tapToTalk: string;
  voiceUnavailable: string;
  language: string;
  close: string;
  /** Acknowledged but the nurse's name is unknown */
  nurseOnTheWay: string;
  /** Settings sheet title (language + large text) */
  settings: string;
  /** Confirm button after "I'm OK" */
  yesCancel: string;
  /** Spoken after an alert is sent: "We've told {nurse}." (follows helpComing) */
  spokenCalled: string;
  /** Settings sheet behind the language icon */
  largeText: string;
  /** Background listening indicator + voice / motion hints */
  listeningOn: string;
  resumeListening: string;
  voiceOpenSafari: string;
  voiceDictationOff: string;
  voiceMicBlocked: string;
  motionDenied: string;
  /** Wake word: hint under the Talk button, and the spoken answer to "Kijo" alone */
  orSayKijo: string;
  wakeYes: string;
}

/** Each language's own name (shown and announced the same in every UI language). */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fr: "Français", es: "Español" };

export const STRINGS: Record<Language, BandStrings> = {
  en: {
    loading: "Loading…",
    missingResident: "This band isn't linked to a resident yet.",
    notFound: "Resident not found.",
    offline: "No connection. Trying again…",
    start: "Start Kijo",
    startHint: "Tap to turn on your band",
    room: "Room",
    bpm: "bpm",
    pain: "Pain",
    bathroom: "Toilet",
    water: "Water",
    needHelp: "Help",
    sending: "Sending…",
    sendFailed: "That didn't send. Please try again.",
    alreadySent: "Already sent. Help is coming.",
    helpComing: "Help is coming",
    onTheWay: "{nurse} is on the way",
    stayCalm: "Stay where you are. Someone is coming.",
    areYouOk: "Are you OK?",
    fallDetected: "It looks like you fell.",
    imOk: "I'm OK",
    callingIn: "If you don't answer, we'll call for help.",
    listening: "Listening…",
    installTitle: "Keep Kijo Band on your home screen",
    installIos: "Tap Share, then “Add to Home Screen”.",
    installButton: "Add to home screen",
    back: "Back",
    cancelRequest: "I'm OK",
    cancelConfirm: "Cancel your request?",
    no: "No",
    nurseWillCheck: "Your nurse will still check on you.",
    requestCancelled: "Request cancelled",
    cancelFailed: "That didn't cancel. Please try again.",
    checkPulse: "Check pulse",
    pulseInstructions: "Cover the back camera and the light with your fingertip.",
    pulseNoTorch: "This phone can't turn on the light. Sit somewhere bright and press lightly.",
    pulseStart: "Start",
    pulseCover: "Cover the camera with your fingertip.",
    pulseHoldStill: "Hold still…",
    pulseSignal: "Signal",
    qualityGood: "Good",
    qualityFair: "Fair",
    qualityPoor: "Weak",
    pulseTryAgain: "Hold still and try again.",
    pulseSent: "Sent to your nurse",
    pulseDisclaimer: "A quick check, not a medical test.",
    pulseNoCamera: "The camera isn't available. Allow camera access and try again.",
    pulseDone: "Done",
    pulseRetry: "Try again",
    tapToTalk: "Tap and talk",
    voiceUnavailable: "Voice doesn't work on this phone. Please use the buttons.",
    language: "Language",
    close: "Close",
    spokenCalled: "We've told {nurse}.",
    largeText: "Large text",
    listeningOn: "Listening",
    resumeListening: "Tap to resume listening",
    voiceOpenSafari: "To use voice, open this page in Safari.",
    voiceDictationOff: "To use voice, turn on Siri and Dictation in Settings.",
    voiceMicBlocked: "To use voice, allow the microphone.",
    motionDenied: "To detect falls, allow Motion & Orientation in Settings.",
    orSayKijo: "or say “Kijo”",
    wakeYes: "Yes?",
    nurseOnTheWay: "Your nurse is on the way",
    settings: "Settings",
    yesCancel: "Yes, cancel",
  },
  fr: {
    loading: "Chargement…",
    missingResident: "Ce bracelet n’est encore lié à aucun résident.",
    notFound: "Résident introuvable.",
    offline: "Pas de connexion. Nouvel essai…",
    start: "Démarrer Kijo",
    startHint: "Touchez pour activer votre bracelet",
    room: "Chambre",
    bpm: "bpm",
    pain: "Douleur",
    bathroom: "Toilettes",
    water: "Eau",
    needHelp: "Aide",
    sending: "Envoi en cours…",
    sendFailed: "L’envoi n’a pas marché. Veuillez réessayer.",
    alreadySent: "Votre demande est déjà envoyée. L’aide arrive.",
    helpComing: "L’aide arrive",
    onTheWay: "{nurse} arrive",
    stayCalm: "Restez où vous êtes. Quelqu’un arrive.",
    areYouOk: "Ça va ?",
    fallDetected: "On dirait que vous avez fait une chute.",
    imOk: "Je vais bien",
    callingIn: "Sans réponse, nous appellerons à l’aide.",
    listening: "À l’écoute…",
    installTitle: "Gardez Kijo Band sur votre écran d’accueil",
    installIos: "Touchez Partager, puis « Sur l’écran d’accueil ».",
    installButton: "Ajouter à l’écran d’accueil",
    back: "Retour",
    cancelRequest: "Je vais bien",
    cancelConfirm: "Annuler votre demande ?",
    no: "Non",
    nurseWillCheck: "L’équipe soignante viendra quand même vous voir.",
    requestCancelled: "Demande annulée",
    cancelFailed: "L’annulation n’a pas marché. Veuillez réessayer.",
    checkPulse: "Prendre le pouls",
    pulseInstructions: "Couvrez la caméra arrière et la lampe avec le bout du doigt.",
    pulseNoTorch: "Ce téléphone ne peut pas allumer la lampe. Installez-vous dans un endroit bien éclairé et appuyez doucement.",
    pulseStart: "Commencer",
    pulseCover: "Couvrez la caméra avec le bout du doigt.",
    pulseHoldStill: "Ne bougez pas…",
    pulseSignal: "Signal",
    qualityGood: "Bon",
    qualityFair: "Moyen",
    qualityPoor: "Faible",
    pulseTryAgain: "Ne bougez pas et réessayez.",
    pulseSent: "Envoyé à l’équipe soignante",
    pulseDisclaimer: "Une simple vérification, pas un examen médical.",
    pulseNoCamera: "La caméra n’est pas disponible. Autorisez l’accès à la caméra et réessayez.",
    pulseDone: "Terminé",
    pulseRetry: "Réessayer",
    tapToTalk: "Touchez et parlez",
    voiceUnavailable: "La voix ne marche pas sur ce téléphone. Veuillez utiliser les boutons.",
    language: "Langue",
    close: "Fermer",
    spokenCalled: "On a prévenu {nurse}.",
    largeText: "Grands caractères",
    listeningOn: "À l’écoute",
    resumeListening: "Touchez pour réactiver l’écoute",
    voiceOpenSafari: "Pour utiliser la voix, ouvrez cette page dans Safari.",
    voiceDictationOff: "Pour utiliser la voix, activez Siri et Dictée dans Réglages.",
    voiceMicBlocked: "Pour utiliser la voix, autorisez le micro.",
    motionDenied: "Pour détecter les chutes, autorisez Mouvement et orientation dans Réglages.",
    orSayKijo: "ou dites « Kijo »",
    wakeYes: "Oui ?",
    nurseOnTheWay: "L’équipe soignante arrive",
    settings: "Réglages",
    yesCancel: "Oui, annuler",
  },
  es: {
    loading: "Cargando…",
    missingResident: "Esta pulsera aún no está vinculada a ningún residente.",
    notFound: "Residente no encontrado.",
    offline: "Sin conexión. Volviendo a intentar…",
    start: "Iniciar Kijo",
    startHint: "Toque para activar su pulsera",
    room: "Habitación",
    bpm: "lpm",
    pain: "Dolor",
    bathroom: "Baño",
    water: "Agua",
    needHelp: "Ayuda",
    sending: "Enviando…",
    sendFailed: "No se pudo enviar. Por favor, inténtelo de nuevo.",
    alreadySent: "Su petición ya está enviada. La ayuda está en camino.",
    helpComing: "La ayuda está en camino",
    onTheWay: "{nurse} va en camino",
    stayCalm: "Quédese donde está. Alguien viene.",
    areYouOk: "¿Está bien?",
    fallDetected: "Parece que se ha caído.",
    imOk: "Estoy bien",
    callingIn: "Si no responde, pediremos ayuda.",
    listening: "Escuchando…",
    installTitle: "Tenga Kijo Band en su pantalla de inicio",
    installIos: "Toque Compartir y luego «Añadir a pantalla de inicio».",
    installButton: "Añadir a la pantalla de inicio",
    back: "Volver",
    cancelRequest: "Estoy bien",
    cancelConfirm: "¿Cancelar su solicitud?",
    no: "No",
    nurseWillCheck: "El personal de enfermería vendrá a verle de todos modos.",
    requestCancelled: "Solicitud cancelada",
    cancelFailed: "No se pudo cancelar. Por favor, inténtelo de nuevo.",
    checkPulse: "Tomar el pulso",
    pulseInstructions: "Cubra la cámara trasera y la luz con la yema del dedo.",
    pulseNoTorch: "Este teléfono no puede encender la luz. Póngase en un lugar con buena luz y presione suavemente.",
    pulseStart: "Empezar",
    pulseCover: "Cubra la cámara con la yema del dedo.",
    pulseHoldStill: "No se mueva…",
    pulseSignal: "Señal",
    qualityGood: "Buena",
    qualityFair: "Regular",
    qualityPoor: "Débil",
    pulseTryAgain: "No se mueva e inténtelo de nuevo.",
    pulseSent: "Enviado al personal de enfermería",
    pulseDisclaimer: "Una comprobación rápida, no una prueba médica.",
    pulseNoCamera: "La cámara no está disponible. Permita el acceso a la cámara e inténtelo de nuevo.",
    pulseDone: "Listo",
    pulseRetry: "Reintentar",
    tapToTalk: "Toque y hable",
    voiceUnavailable: "La voz no funciona en este teléfono. Por favor, use los botones.",
    language: "Idioma",
    close: "Cerrar",
    spokenCalled: "Hemos avisado a {nurse}.",
    largeText: "Letra grande",
    listeningOn: "Escuchando",
    resumeListening: "Toque para volver a escuchar",
    voiceOpenSafari: "Para usar la voz, abra esta página en Safari.",
    voiceDictationOff: "Para usar la voz, active Siri y Dictado en Ajustes.",
    voiceMicBlocked: "Para usar la voz, permita el micrófono.",
    motionDenied: "Para detectar caídas, permita Movimiento y orientación en Ajustes.",
    orSayKijo: "o diga «Kijo»",
    wakeYes: "¿Sí?",
    nurseOnTheWay: "El personal de enfermería va en camino",
    settings: "Ajustes",
    yesCancel: "Sí, cancelar",
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
