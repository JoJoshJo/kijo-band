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
  /** within the 10 s limit: the request already went out */
  alreadySent: string;
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
  measured: string;
  /** Live activity state chip */
  motionMoving: string;
  motionStill: string;
  motionLying: string;
  /** Simplified band: Talk button, corner language icon, banner sheet */
  tapToTalk: string;
  voiceUnavailable: string;
  language: string;
  close: string;
  /** Spoken after an alert is sent: "{nurse} has been called." (follows helpComing) */
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
    missingResident: "No resident selected.",
    notFound: "Resident not found.",
    offline: "Connection lost — retrying…",
    start: "Start Kijo",
    startHint: "Tap to turn on your band",
    room: "Room",
    bpm: "bpm",
    help: "HELP",
    pain: "Pain",
    bathroom: "Toilet",
    water: "Water",
    needHelp: "Help",
    sending: "Sending…",
    sendFailed: "Couldn't send. Please try again.",
    waitMoment: "Please wait a moment.",
    alreadySent: "Already sent. Help is on the way.",
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
    checkPulse: "Check pulse",
    pulseInstructions: "Cover the back camera and flash with your fingertip",
    pulseNoTorch: "No flash control on this phone — use a bright room and press lightly.",
    pulseStart: "Start",
    pulseCover: "Cover the camera with your fingertip",
    pulseHoldStill: "Hold still…",
    pulseSignal: "Signal",
    qualityGood: "Good",
    qualityFair: "Fair",
    qualityPoor: "Weak",
    pulseTryAgain: "Try again — hold still",
    pulseSent: "Sent to your nurse",
    pulseDisclaimer: "Spot check — not a medical device",
    pulseNoCamera: "Camera not available. Allow camera access and try again.",
    pulseDone: "Done",
    pulseRetry: "Try again",
    measured: "measured",
    motionMoving: "Moving",
    motionStill: "Still",
    motionLying: "Lying down",
    tapToTalk: "Tap and talk",
    voiceUnavailable: "Voice isn't available here — please use the buttons.",
    language: "Language",
    close: "Close",
    spokenCalled: "{nurse} has been called.",
    largeText: "Large text",
    listeningOn: "Listening",
    resumeListening: "Tap to resume listening",
    voiceOpenSafari: "Voice works in Safari — open the link in Safari",
    voiceDictationOff: "Turn on Siri & Dictation in Settings to use voice.",
    voiceMicBlocked: "Allow the microphone to use voice.",
    motionDenied: "Allow Motion & Orientation to detect falls",
    orSayKijo: "or say “Kijo”",
    wakeYes: "Yes?",
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
    alreadySent: "C'est déjà envoyé. On arrive.",
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
    checkPulse: "Prendre le pouls",
    pulseInstructions: "Couvrez la caméra arrière et le flash avec le bout du doigt",
    pulseNoTorch: "Pas de contrôle du flash sur ce téléphone — placez-vous dans une pièce bien éclairée et appuyez légèrement.",
    pulseStart: "Commencer",
    pulseCover: "Couvrez la caméra avec le bout du doigt",
    pulseHoldStill: "Ne bougez pas…",
    pulseSignal: "Signal",
    qualityGood: "Bon",
    qualityFair: "Moyen",
    qualityPoor: "Faible",
    pulseTryAgain: "Réessayez — ne bougez pas",
    pulseSent: "Envoyé à l’équipe soignante",
    pulseDisclaimer: "Mesure ponctuelle — pas un dispositif médical",
    pulseNoCamera: "Caméra indisponible. Autorisez l’accès à la caméra et réessayez.",
    pulseDone: "Terminé",
    pulseRetry: "Réessayer",
    measured: "mesuré",
    motionMoving: "En mouvement",
    motionStill: "Au repos",
    motionLying: "Allongé·e",
    tapToTalk: "Touchez et parlez",
    voiceUnavailable: "La voix n’est pas disponible ici — utilisez les boutons.",
    language: "Langue",
    close: "Fermer",
    spokenCalled: "On a prévenu {nurse}.",
    largeText: "Grands caractères",
    listeningOn: "À l’écoute",
    resumeListening: "Touchez pour réactiver l’écoute",
    voiceOpenSafari: "La voix fonctionne dans Safari — ouvrez le lien dans Safari",
    voiceDictationOff: "Activez Siri et Dictée dans Réglages pour utiliser la voix.",
    voiceMicBlocked: "Autorisez le micro pour utiliser la voix.",
    motionDenied: "Autorisez Mouvement et orientation pour détecter les chutes",
    orSayKijo: "ou dites « Kijo »",
    wakeYes: "Oui ?",
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
    alreadySent: "Ya está enviado. Ya vienen.",
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
    checkPulse: "Tomar el pulso",
    pulseInstructions: "Cubra la cámara trasera y el flash con la yema del dedo",
    pulseNoTorch: "Este teléfono no permite usar el flash — póngase en un lugar bien iluminado y presione suavemente.",
    pulseStart: "Empezar",
    pulseCover: "Cubra la cámara con la yema del dedo",
    pulseHoldStill: "No se mueva…",
    pulseSignal: "Señal",
    qualityGood: "Buena",
    qualityFair: "Regular",
    qualityPoor: "Débil",
    pulseTryAgain: "Inténtelo de nuevo — no se mueva",
    pulseSent: "Enviado al personal de enfermería",
    pulseDisclaimer: "Medición puntual — no es un dispositivo médico",
    pulseNoCamera: "Cámara no disponible. Permita el acceso a la cámara e inténtelo de nuevo.",
    pulseDone: "Listo",
    pulseRetry: "Reintentar",
    measured: "medido",
    motionMoving: "En movimiento",
    motionStill: "En reposo",
    motionLying: "Acostado/a",
    tapToTalk: "Toque y hable",
    voiceUnavailable: "La voz no está disponible aquí — use los botones.",
    language: "Idioma",
    close: "Cerrar",
    spokenCalled: "Hemos avisado a {nurse}.",
    largeText: "Letra grande",
    listeningOn: "Escuchando",
    resumeListening: "Toque para volver a escuchar",
    voiceOpenSafari: "La voz funciona en Safari: abra el enlace en Safari",
    voiceDictationOff: "Active Siri y Dictado en Ajustes para usar la voz.",
    voiceMicBlocked: "Permita el micrófono para usar la voz.",
    motionDenied: "Permita Movimiento y orientación para detectar caídas",
    orSayKijo: "o diga «Kijo»",
    wakeYes: "¿Sí?",
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
