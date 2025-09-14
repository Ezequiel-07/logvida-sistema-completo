
"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { TypeAnimation } from "react-type-animation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { Tilt } from "react-tilt";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import type { Container, Engine, IParticlesOptions, RecursivePartial } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";
import { MapPin } from "lucide-react";


const features = [
  {
    title: "Agilidade e Pontualidade",
    description: "Rotas otimizadas e compromisso com os prazos. Sua entrega chega quando você precisa, sem atrasos.",
    image: "/kamgoo.png",
    alt: "Agilidade e Pontualidade",
    aiHint: "delivery van",
  },
  {
    title: "Certificações e Conformidade",
    description: "Sua carga é nosso bem mais precioso. Transportamos com o máximo cuidado e protocolos de segurança rigorosos.",
    image: "/certificados.png",
    alt: "Segurança e Confiança",
aiHint: "3d shield",
  },
  {
    title: "Tecnologia e Rastreamento",
    description: "Acompanhe sua entrega em tempo real através do nosso portal do cliente. Transparência total, do início ao fim.",
    image: "/fiorinoetiqueta.png",
    alt: "Tecnologia e Rastreamento",
    aiHint: "box label logistics",
  }
];

const weeklyRoutes = [
  {
    day: "Segunda & Quinta",
    description: "Saídas de Tubarão com destino às cidades do norte da região.",
    cities: ["Jaraguá do Sul", "São Bento do Sul"],
    note: "Possibilidade de paradas em cidades entre os trajetos.",
    color: "text-red-500"
  },
  {
    day: "Terça",
    description: "Saída direta de Tubarão para o sul da região.",
    cities: ["Araranguá"],
    note: null,
    color: "text-amber-500"
  },
  {
    day: "Quarta",
    description: "Rotas para cidades serranas e do planalto.",
    cities: ["Lages", "Curitibanos", "Otacílio Costa"],
    note: null,
    color: "text-blue-500"
  },
  {
    day: "Sexta",
    description: "Rotas para cidades do sul e litoral.",
    cities: ["Timbé do Sul", "Araranguá", "Criciúma"],
    note: null,
    color: "text-green-500"
  }
];


export default function HomePage() {
  const [init, setInit] = useState(false);
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const carouselTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [hasHovered, setHasHovered] = useState(false);
  const controls = useAnimationControls();
  const driveTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const tiltOptions = {
    max: 25,
    perspective: 1000,
    scale: 1.05,
    transition: true,
    speed: 1500,
    easing: "cubic-bezier(.03,.98,.52,.99)",
  };


  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);
  
  const particlesOptions: RecursivePartial<IParticlesOptions> = useMemo(() => ({
    fullScreen: { enable: true, zIndex: 0 },
    detectRetina: true,
    background: { color: "transparent" },
    fpsLimit: 120,
    interactivity: {
      events: {
        onHover: {
          enable: true,
          mode: "repulse",
        },
      },
    },
    particles: {
      color: { value: "#2E8B57" },
      links: { color: "#2E8B57", distance: 150, enable: true, opacity: 0.1, width: 1 },
      move: { direction: "none", enable: true, outModes: { default: "out" }, random: true, speed: 1, straight: false },
      number: { density: { enable: true }, value: 80 },
      opacity: { value: 0.1 },
      shape: { type: "circle" },
      size: { value: { min: 1, max: 3 } },
    },
  }), []);

  const startCarouselTimer = useCallback(() => {
    if (carouselTimerRef.current) {
      clearInterval(carouselTimerRef.current);
    }
    carouselTimerRef.current = setInterval(() => {
      setActiveFeatureIndex((prevIndex) => (prevIndex + 1) % features.length);
    }, 5000);
  }, []);

  useEffect(() => {
      startCarouselTimer();
      return () => {
          if(carouselTimerRef.current) {
              clearInterval(carouselTimerRef.current)
          }
      }
  }, [startCarouselTimer])

  const handleCarouselInteraction = useCallback((index: number) => {
    setActiveFeatureIndex(index);
    startCarouselTimer();
  }, [startCarouselTimer]);
  
  const handleVanHoverStart = () => {
    setHasHovered(true);
    if (driveTimeoutRef.current) {
      clearTimeout(driveTimeoutRef.current);
    }
  };

  const handleVanHoverEnd = () => {
    if (driveTimeoutRef.current) {
      clearTimeout(driveTimeoutRef.current);
    }
    driveTimeoutRef.current = setTimeout(async () => {
      if (hasHovered) {
        await controls.start("drive");
        await controls.start("hidden"); // Move to hidden state
        controls.set("initial"); // Reset instantly
      }
    }, 2000); // 2 seconds delay after hover ends
  };


  const carouselVariants = {
    enter: {
      x: '100%',
      opacity: 0,
      scale: 0.8,
    },
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { type: "spring", stiffness: 300, damping: 30 },
        opacity: { duration: 0.2 },
        duration: 0.5,
      },
    },
    exit: {
      x: '-100%',
      opacity: 0,
      scale: 0.8,
      transition: {
        x: { type: "spring", stiffness: 300, damping: 30 },
        opacity: { duration: 0.2 },
        duration: 0.5,
      },
    },
  };

  const vanDriveAwayVariants = {
    initial: { scale: 1, y: 0, opacity: 1 },
    drive: {
      scale: 0.1,
      y: -150,
      opacity: 0,
      transition: { duration: 1.5, ease: "easeIn" }
    },
    hidden: {
      opacity: 0,
      transition: { duration: 0.1 }
    }
  };


  return (
    <div className="text-foreground w-full bg-background relative">
      <div className="fixed inset-0 z-0 pointer-events-none">
        {init && (
           <Particles
               id="tsparticles"
               options={particlesOptions}
           />
        )}
      </div>

      <div className="relative z-[1] bg-transparent">
        <header className="fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between bg-background/60 px-4 shadow-md backdrop-blur-sm md:px-6">
          <Link href="/" className="flex items-center gap-2">
             <div className="relative w-10 h-10">
                <Image
                src="/logvida-logo.png"
                alt="LogVida Logo"
                fill
                sizes="40px"
                className="object-contain"
                />
            </div>
            <span className="text-xl font-bold">
              <span className="text-primary">logvida</span>
              <span className="text-blue-600">.com</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Button asChild variant="outline">
              <Link href="/quote">Solicitar Orçamento</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Entrar</Link>
            </Button>
          </div>
        </header>

        <main className="pt-16">
          <section className="relative flex min-h-[calc(100vh-4rem)] w-full items-center justify-between gap-8 overflow-hidden bg-transparent px-6 py-16 lg:px-24 md:flex-row flex-col">
            <div className="z-10 w-full md:w-1/2 text-center md:text-left">
              <h1 className="flex min-h-[140px] items-center text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:min-h-[100px] lg:text-6xl !leading-tight">
                <TypeAnimation
                  sequence={[
                    "Logística Inteligente, Vida em Movimento.", 2000,
                    "Conectamos a saúde com agilidade.", 2000,
                    "Conectamos a saúde com segurança.", 2000,
                    "Conectamos a saúde com tecnologia.", 2000,
                  ]}
                  wrapper="span"
                  speed={50}
                  repeat={Infinity}
                />
              </h1>
              <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground md:mx-0 md:text-xl">
                Soluções de transporte dedicadas para o que mais importa.
              </p>
              <div className="mt-8 flex justify-center md:justify-start">
                <Button asChild size="lg" className="text-lg">
                  <Link href="/quote">Solicite um Orçamento Agora</Link>
                </Button>
              </div>
            </div>
             <div className="w-full md:w-1/2 flex justify-center items-center p-4">
                <motion.div
                  className="relative w-full max-w-sm flex justify-center items-center group"
                  onHoverStart={handleVanHoverStart}
                  onHoverEnd={handleVanHoverEnd}
                  variants={vanDriveAwayVariants}
                  animate={controls}
                  initial="initial"
                >
                  <svg
                    viewBox="0 0 500 400"
                    className="w-full h-auto drop-shadow-2xl"
                    xmlns="http://www.w3.org/2000/svg"
                    data-ai-hint="renault kangoo back"
                  >
                    <defs>
                      <clipPath id="cargo-clip">
                        <path d="M 120 100 Q 120 90 130 90 L 370 90 Q 380 90 380 100 L 380 330 Q 380 340 370 340 L 130 340 Q 120 340 120 330 Z" />
                      </clipPath>
                    </defs>

                    {/* Tires */}
                    <rect x="70" y="340" width="80" height="25" rx="8" fill="#2d3748" />
                    <rect x="350" y="340" width="80" height="25" rx="8" fill="#2d3748" />

                    {/* Main Body */}
                    <g id="body">
                      <path d="M 80 345 Q 60 345 60 325 L 60 110 Q 60 90 80 85 L 100 80 L 400 80 L 420 85 Q 440 90 440 110 L 440 325 Q 440 345 420 345 Z" fill="#FFFFFF" />
                      <rect x="50" y="340" width="400" height="30" rx="6" fill="#1f2937" />
                    </g>

                    {/* Tail Lights */}
                    <g id="lights">
                        {/* Left Light */}
                        <path d="M 80 100 L 80 280 C 80 295 95 305 105 295 L 105 110 C 95 95 80 85 80 100 Z" fill="#DC2626"/>
                        <path d="M 82 230 L 82 270 C 82 280 92 285 98 278 L 98 238 C 92 225 82 220 82 230 Z" fill="#FFFFFF" opacity="0.6"/>
                        {/* Right Light */}
                        <path d="M 420 100 L 420 280 C 420 295 405 305 395 295 L 395 110 C 405 95 420 85 420 100 Z" fill="#DC2626"/>
                        <path d="M 418 230 L 418 270 C 418 280 408 285 402 278 L 402 238 C 408 225 418 220 418 230 Z" fill="#FFFFFF" opacity="0.6"/>
                        {/* Top Brake Light */}
                        <rect x="180" y="65" width="140" height="12" rx="4" fill="#DC2626" />
                    </g>
                    
                    {/* Handle Bar */}
                    <rect x="150" y="200" width="200" height="15" rx="5" fill="#1f2937"/>
                    
                    {/* Finer handles on the bar */}
                    <rect x="160" y="202" width="30" height="11" rx="3" fill="#374151" className="group-hover:opacity-0 transition-opacity"/>
                    <rect x="310" y="202" width="30" height="11" rx="3" fill="#374151" className="group-hover:opacity-0 transition-opacity"/>
                    

                    <image
                        href="/caixascarro.png"
                        x="120" y="90" width="260" height="250"
                        preserveAspectRatio="xMidYMid slice"
                        clipPath="url(#cargo-clip)"
                        className="transition-opacity duration-1000 group-hover:opacity-100 opacity-0"
                    />

                    {/* Doors */}
                    <g className="origin-center" style={{ transformOrigin: "center" }}>
                        {/* Left Door */}
                        <g className="origin-left transition-transform duration-1000 ease-in-out group-hover:[transform:rotateY(-140deg)]">
                            <rect x="100" y="80" width="150" height="260" rx="8" fill="#FFFFFF" />
                            <image href="/logvida-logo.png" x="115" y="140" height="50" width="120" className="transition-opacity duration-300 group-hover:opacity-0" />
                        </g>
                        {/* Right Door */}
                        <rect
                            x="250" y="80" width="150" height="260" rx="8"
                            className="origin-right transition-transform duration-1000 ease-in-out group-hover:[transform:rotateY(140deg)]"
                            fill="#FFFFFF"
                        />
                    </g>

                    <line x1="250" y1="80" x2="250" y2="340" stroke="#e5e7eb" strokeWidth="2" />
                  </svg>
                </motion.div>
             </div>
          </section>

          {/* Features Section */}
          <section id="features" className="w-full py-16 md:py-24 lg:py-32">
            <div className="container px-4 md:px-6">
              <div className="mx-auto max-w-3xl text-center">
                <h2 className="text-3xl font-bold tracking-tighter text-primary sm:text-4xl md:text-5xl">
                  Nossos Compromissos com Você
                </h2>
                <p className="mt-4 text-muted-foreground md:text-lg">
                  Combinamos tecnologia e cuidado para oferecer um serviço de
                  transporte em que você pode confiar.
                </p>
              </div>
              <div className="mt-12 flex flex-col items-center">
                <div className="relative flex h-auto min-h-[550px] w-full max-w-xl items-center justify-center overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeFeatureIndex}
                      variants={carouselVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      className="absolute w-full max-w-md"
                    >
                      <Tilt options={tiltOptions}>
                          <Card className="h-full transform-gpu transition-all duration-300">
                            <CardHeader className="items-center text-center">
                                <Image 
                                  src={features[activeFeatureIndex].image} 
                                  alt={features[activeFeatureIndex].alt} 
                                  width={400} 
                                  height={300} 
                                  className="object-contain max-h-[300px] mb-4 rounded-t-lg" 
                                  data-ai-hint={features[activeFeatureIndex].aiHint} 
                                />
                            </CardHeader>
                            <CardContent>
                                <h3 className="text-xl font-bold text-primary text-center">{features[activeFeatureIndex].title}</h3>
                                <p className="text-muted-foreground text-center mt-2">{features[activeFeatureIndex].description}</p>
                            </CardContent>
                          </Card>
                      </Tilt>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="mt-8 flex justify-center gap-3">
                  {features.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => handleCarouselInteraction(index)}
                      className={cn(
                        "h-3 w-3 rounded-full bg-primary/30 transition-all duration-300",
                        { "w-6 bg-primary": activeFeatureIndex === index }
                      )}
                      aria-label={`Ver o card ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
          
          {/* Weekly Routes Section */}
          <section id="weekly-routes" className="w-full py-16 md:py-24 lg:py-32 bg-muted/30">
            <div className="container px-4 md:px-6">
              <div className="mx-auto max-w-3xl text-center">
                <h2 className="text-3xl font-bold tracking-tighter text-primary sm:text-4xl md:text-5xl">
                  Rotas Fixas Semanais
                </h2>
                <p className="mt-4 text-muted-foreground md:text-lg">
                  Cidade base: <span className="font-semibold text-foreground">Tubarão (SC)</span> — rotas regulares por dia da semana.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mt-12">
                {weeklyRoutes.map((route) => {
                   const message = `Tenho interesse na rota de ${route.day}. Cidades de interesse: ${route.cities.join(', ')}. ${route.note || ''}`;
                   const href = `/quote?message=${encodeURIComponent(message)}`;
                   return (
                    <Tilt options={tiltOptions} key={route.day}>
                      <Link href={href} className="block hover:no-underline h-full">
                          <Card className="flex flex-col w-full max-w-sm mx-auto transition-all duration-300 h-full group">
                              <CardHeader>
                              <div className="flex justify-between items-center">
                                  <CardTitle className="text-lg font-bold">{route.day}</CardTitle>
                                  <div className="text-xs font-semibold uppercase tracking-wider text-primary">Semanal</div>
                              </div>
                              </CardHeader>
                              <CardContent className="flex-grow space-y-3">
                              <p className="text-sm text-muted-foreground">{route.description}</p>
                              <ul className="space-y-1">
                                  {route.cities.map(city => (
                                  <li key={city} className="flex items-center text-sm">
                                      <MapPin className={cn("mr-2 h-4 w-4", route.color)} />
                                      {city}
                                  </li>
                                  ))}
                              </ul>
                              {route.note && <p className="text-xs italic text-muted-foreground pt-2">{route.note}</p>}
                              </CardContent>
                              <CardFooter className="p-4 mt-auto">
                                <span className="text-xs font-semibold text-primary group-hover:underline">Solicitar Coleta nesta Rota →</span>
                              </CardFooter>
                          </Card>
                      </Link>
                    </Tilt>
                   );
                })}
              </div>
              <div className="text-center mt-8 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold">Observações:</span> As rotas acima são saídas previstas e podem sofrer alterações por demanda ou condições de trânsito.
                  <br />
                  Para agendar uma coleta ou confirmar parada em cidade intermediária,{" "}
                  <Link href="/quote" className="underline text-primary hover:text-primary/80">
                    entre em contato
                  </Link>.
                </p>
              </div>
            </div>
          </section>

          {/* Who We Are Section */}
          <section id="about" className="w-full py-16 md:py-24 lg:py-32 bg-transparent">
            <div className="container px-4 md:px-6">
              <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <div className="flex justify-center">
                  <Image
                    src="/logofiorino.png"
                    alt="Equipe LogVida"
                    width={600}
                    height={450}
                    className="w-full max-w-md rounded-lg object-cover shadow-xl"
                    data-ai-hint="office building logistics"
                  />
                </div>
                <div className="space-y-4">
                  <div className="inline-block rounded-lg bg-background px-3 py-1 text-sm text-primary font-semibold">
                    Quem Somos
                  </div>
                  <h2 className="text-3xl font-bold tracking-tighter text-primary sm:text-4xl">
                    Sua Parceira em Logística para a Saúde
                  </h2>
                  <div className="space-y-4 text-muted-foreground md:text-lg">
                      <p>
                        Desde junho de 2020, somos especializados no transporte de materiais hospitalares e laboratoriais em todo o estado de Santa Catarina. Nossa missão é conectar a saúde com agilidade, segurança e tecnologia, garantindo a integridade de cada entrega.
                      </p>
                      <p>
                        Contamos com todas as certificações e registros exigidos, atuando em conformidade com as normas regulatórias do setor. Nossas rotas fixas já consolidadas permitem condições especiais para clientes que utilizam trajetos regulares.
                      </p>
                      <p>
                        Com responsabilidade e compromisso com a qualidade, nos destacamos como referência no transporte de cargas sensíveis, assegurando que cada entrega seja realizada com precisão e cuidado.
                      </p>
                  </div>
                  <div className="mt-4 rounded-lg border bg-card p-4 text-sm">
                    <p className="font-semibold">Nossa Localização:</p>
                    <p className="text-muted-foreground">
                      Rua Vigário José Poggel, nº 494, Sala 905, Prédio Royalle -
                      Tubarão, SC - CEP 88704-240
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
          
          {/* Final CTA Section */}
          <section id="cta" className="w-full py-16 md:py-24 lg:py-32">
              <Card className="container mx-auto max-w-4xl p-8 text-center bg-card/50 backdrop-blur-md border-primary/20 shadow-2xl">
                  <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-primary">
                  Pronto para Otimizar sua Logística?
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-muted-foreground md:text-lg">
                  Deixe-nos cuidar do transporte para que você possa focar no que
                  faz de melhor.
                  </p>
                  <div className="mt-8">
                  <Button asChild size="lg" className="text-lg">
                      <Link href="/quote">Fale com um Especialista</Link>
                  </Button>
                  </div>
              </Card>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t bg-background">
          <div className="container mx-auto flex flex-col items-center justify-between gap-4 py-8 px-4 md:flex-row md:px-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="relative w-8 h-8">
                <Image
                  src="/logvida-logo.png"
                  alt="LogVida Logo"
                  fill
                  sizes="32px"
                  className="object-contain"
                />
              </div>
              <span className="font-semibold text-primary">logvida.com</span>
            </Link>
            <div className="text-center text-sm text-muted-foreground">
              <p>Rua Vigário José Poggel, nº 494, Sala 905, Prédio Royalle -
                      Tubarão, SC - CEP 88704-240</p>
              <p>
                © {new Date().getFullYear()} LogVida. Todos os direitos reservados.
              </p>
            </div>
            <a
              href="https://wa.me/5548998503327"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary"
              aria-label="Contato via WhatsApp"
            >
              <Icons.whatsapp className="h-4 w-4 text-green-500" />
              <span>(48) 99850-3327</span>
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

