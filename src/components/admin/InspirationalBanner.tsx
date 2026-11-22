import { useState, useMemo } from "react";
import { Sparkles, Quote, RefreshCw } from "lucide-react";

export interface InspirationalQuote {
  text: string;
  author?: string;
}

export const INSPIRATIONAL_QUOTES: InspirationalQuote[] = [
  {
    text: "El perfume de un hombre anuncia su llegada y prolonga su partida.",
    author: "Coco Chanel",
  },
  {
    text: "La elegancia no consiste en llamar la atención, sino en ser recordado.",
    author: "Giorgio Armani",
  },
  {
    text: "El aroma es el hermano de la respiración; entra en nosotros y nos llena por completo.",
    author: "Patrick Süskind",
  },
  {
    text: "La constancia y la disciplina convierten los pequeños comienzos en grandes imperios.",
    author: "Perfumes SAAD",
  },
  {
    text: "La calidad nunca es un accidente; siempre es el resultado de un esfuerzo inteligente.",
    author: "John Ruskin",
  },
  {
    text: "Un perfume inolvidable es la firma invisible de una gran personalidad.",
    author: "Gianni Versace",
  },
  {
    text: "El secreto del éxito no es la suerte, sino la perseverancia y la pasión por lo que haces.",
    author: "Perfumes SAAD",
  },
  {
    text: "El lujo es una necesidad que empieza donde la necesidad acaba.",
    author: "Coco Chanel",
  },
  {
    text: "No busques clientes para tus productos; busca superar las expectativas de cada persona que confía en ti.",
    author: "Filosofía SAAD",
  },
  {
    text: "El verdadero lujo radica en la excelencia de cada detalle y en la autenticidad del trato.",
    author: "Jean-Paul Guerlain",
  },
  {
    text: "Siembra dedicación y servicio impecable en cada pedido, y cosecharás la lealtad de tus clientes.",
    author: "Perfumes SAAD",
  },
  {
    text: "El aroma del éxito huele a disciplina diaria, visión clara y estándares elevados.",
    author: "Inspiración SAAD",
  },
  {
    text: "Tu marca personal y tu fragancia tienen algo en común: dejan huella sin necesidad de palabras.",
    author: "Perfumes SAAD",
  },
  {
    text: "No cuentes los días; haz que cada día y cada entrega cuenten.",
    author: "Muhammad Ali",
  },
  {
    text: "Cada frasco que entregas lleva consigo una promesa de distinción y confianza cumplida.",
    author: "Perfumes SAAD",
  },
  {
    text: "El coraje de persistir cuando el camino se torna exigente es lo que crea a los verdaderos líderes.",
    author: "Winston Churchill",
  },
  {
    text: "La disciplina tarde o temprano vence al talento. Mantén el enfoque y la meta clara.",
    author: "Filosofía del Éxito",
  },
  {
    text: "Una fragancia perdura en la memoria mucho después de que los momentos se han ido.",
    author: "Christian Dior",
  },
  {
    text: "Nunca soñé con el éxito. Trabajé para conseguirlo día tras día.",
    author: "Estée Lauder",
  },
  {
    text: "Haz de la excelencia un estándar innegociable y el reconocimiento llegará por sí solo.",
    author: "Perfumes SAAD",
  },
  {
    text: "Cada cliente satisfecho es el mejor embajador de tu pasión y de tu negocio.",
    author: "Filosofía SAAD",
  },
  {
    text: "Quien domina la paciencia y el trabajo constante domina su propio destino.",
    author: "Patrick Süskind",
  },
  {
    text: "La pasión por tu negocio se siente en cada interacción, como una fragancia que cautiva al instante.",
    author: "Perfumes SAAD",
  },
  {
    text: "Grandes resultados demandan decisiones firmes. Haz que la jornada de hoy marque la diferencia.",
    author: "Inspiración SAAD",
  },
  {
    text: "El éxito es la suma de pequeños esfuerzos repetidos con excelencia día tras día.",
    author: "Robert Collier",
  },
  {
    text: "En Perfumes SAAD no solo vendemos aromas; creamos recuerdos inolvidables y momentos de distinción.",
    author: "Saad",
  },
  {
    text: "La confianza de un cliente se gana con honestidad, se cuida con calidad y se multiplica con excelencia.",
    author: "Perfumes SAAD",
  },
  {
    text: "Los límites solo existen en la mente de quienes no se atreven a soñar en grande.",
    author: "Napoleon Hill",
  },
];

function formatGreetingName(rawName?: string | null): string {
  if (!rawName || !rawName.trim()) return "Saad";
  const clean = rawName.trim();

  // Si es un email
  if (clean.includes("@")) {
    const userPart = clean.split("@")[0].toLowerCase();
    if (userPart.includes("saad")) return "Saad";
    if (userPart.includes("elias")) return "Elías";
    const alpha = userPart.split(/[._\d]/)[0];
    return alpha ? alpha.charAt(0).toUpperCase() + alpha.slice(1) : "Saad";
  }

  // Si es un nombre compuesto, tomar el primer nombre
  const firstWord = clean.split(/\s+/)[0];
  const lower = firstWord.toLowerCase();
  if (lower === "elias") return "Elías";
  if (lower === "saad") return "Saad";
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

function getGreeting(userName?: string): { greeting: string; iconEmoji: string } {
  // Calculado con base en la hora de Colombia (America/Bogota)
  const bogotaHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );

  let timeSalutation = "Buenos días";
  let iconEmoji = "☀️";
  if (bogotaHour >= 12 && bogotaHour < 19) {
    timeSalutation = "Buenas tardes";
    iconEmoji = "🌤️";
  } else if (bogotaHour >= 19 || bogotaHour < 5) {
    timeSalutation = "Buenas noches";
    iconEmoji = "🌙";
  }

  const name = formatGreetingName(userName);
  return {
    greeting: `${timeSalutation}, ${name}`,
    iconEmoji,
  };
}

export default function InspirationalBanner({ userName }: { userName?: string }) {
  const { greeting, iconEmoji } = useMemo(() => getGreeting(userName), [userName]);

  // Selección inicial según el día del año para que cambie automáticamente cada día
  const initialIndex = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    return dayOfYear % INSPIRATIONAL_QUOTES.length;
  }, []);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isRotating, setIsRotating] = useState(false);

  const currentQuote = INSPIRATIONAL_QUOTES[currentIndex] ?? INSPIRATIONAL_QUOTES[0];

  const handleNextQuote = () => {
    setIsRotating(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % INSPIRATIONAL_QUOTES.length);
      setIsRotating(false);
    }, 180);
  };

  return (
    <div className="dashboard-inspirational-banner" role="region" aria-label="Saludo e inspiración diaria">
      <div className="inspirational-banner-content">
        <div className="inspirational-greeting-row">
          <span className="inspirational-emoji" aria-hidden="true">{iconEmoji}</span>
          <h2 className="inspirational-greeting-text">
            ¡{greeting}!
          </h2>
          <span className="inspirational-badge">
            <Sparkles size={12} className="inspirational-sparkle-icon" />
            <span>Inspiración</span>
          </span>
        </div>

        <div className={`inspirational-quote-block ${isRotating ? "is-changing" : ""}`}>
          <Quote size={16} className="inspirational-quote-mark" aria-hidden="true" />
          <blockquote className="inspirational-quote-text">
            “{currentQuote.text}”
          </blockquote>
          {currentQuote.author && (
            <cite className="inspirational-quote-author">
              — {currentQuote.author}
            </cite>
          )}
        </div>
      </div>

      <div className="inspirational-banner-actions">
        <button
          type="button"
          className="inspirational-refresh-btn"
          onClick={handleNextQuote}
          title="Cambiar a otra frase inspiracional"
          aria-label="Cambiar a otra frase inspiracional"
        >
          <RefreshCw size={13} className={isRotating ? "animate-spin" : ""} />
          <span>Otra frase</span>
        </button>
      </div>
    </div>
  );
}
