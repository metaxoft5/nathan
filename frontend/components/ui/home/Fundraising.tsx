"use client";

import { useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from "react";
import gsap from "gsap";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CustomButton from "@/components/custom/CustomButton";
import Image from "next/image";
import localFont from "next/font/local";

const grobold = localFont({
  src: "../../../public/assets/fonts/GROBOLD.ttf",
});

const slidesCount = 3;
const slideBaseClass = "absolute inset-0 w-full h-full";

const Fundraising = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slidesCount);
    }, 6000);

    return () => window.clearInterval(interval);
  }, []);

  const nextSlide = () => {
    setActiveSlide((current) => (current + 1) % slidesCount);
  };

  const prevSlide = () => {
    setActiveSlide((current) => (current - 1 + slidesCount) % slidesCount);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;

    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const swipeDistance = touchEndX - touchStartX.current;

    if (swipeDistance > 50) {
      prevSlide();
    } else if (swipeDistance < -50) {
      nextSlide();
    }

    touchStartX.current = null;
  };

  useLayoutEffect(() => {
    const slideElement = slideRefs.current[activeSlide];

    if (!slideElement) return;

    const background = slideElement.querySelector<HTMLElement>("[data-fundraising-bg]");
    const contentElements = slideElement.querySelectorAll<HTMLElement>("[data-fundraising-content]");

    if (!background) return;

    const timeline = gsap.timeline({
      defaults: {
        ease: "power3.out",
      },
    });

    gsap.set(background, { xPercent: -100 });
    gsap.set(contentElements, { xPercent: 100 });

    timeline.to(background, {
      xPercent: 0,
      duration: 1,
    });

    timeline.to(
      contentElements,
      {
        xPercent: 0,
        duration: 0.9,
        stagger: 0.08,
      },
      "<0.15"
    );

    return () => {
      timeline.kill();
    };
  }, [activeSlide]);

  return (
    <>
    <section className="w-full bg-white hidden md:flex">
      <div
        className="relative w-full min-h-[90svh] md:min-h-[90vh] overflow-hidden"
        aria-roledescription="carousel"
        aria-label="Fundraising hero slider"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={(el) => {
            slideRefs.current[0] = el;
          }}
          className={`${slideBaseClass} ${activeSlide === 0 ? "visible" : "invisible pointer-events-none"}`}
        >
          <main className="bg-primary h-full">
            <div className="layout relative w-full md:h-[90vh] h-fit overflow-hidden flex flex-col md:flex-row items-center justify-center gap-10 sm:gap-12 md:gap-14 lg:gap-16">
              <div aria-hidden="true" data-fundraising-bg className="pointer-events-none absolute inset-0 bg-primary" />
              <div
                data-fundraising-content
                className="relative z-10 w-full md:w-1/2 h-1/2 md:h-full flex flex-col mt-20 md:mt-0 items-center justify-center md:pl-8 lg:pl-0"
              >
                <h1
                  className={
                    grobold.className +
                    " text-white font-bold text-2xl md:text-7xl text-center md:text-left"
                  }
                >
                  Fundraising just got sweeter
                </h1>

                <p className="text-white text-base font-bold font-inter md:text-2xl text-center md:text-left">
                  Sell Southern Sweet &amp; Sour Licorice Ropes and keep 50% of every sale. No fees, no minimums, just success.
                </p>
                <Image src="/assets/images/arrow.webp" alt="Arrow" width={100} height={100} className="w-16 h-16 md:w-[100px] md:h-[100px] float-right" />
                <div className="w-full flex justify-center md:justify-start">
                  <CustomButton
                    title="Get Started Now"
                    className="font-bold text-white md:w-auto px-8 py-3 md:py-4 mt-4"
                    href="https://lp.constantcontactpages.com/sl/kaaCahu/fundraise"
                  />
                </div>
              </div>
              <div
                data-fundraising-content
                className="relative z-10 w-full md:w-1/2 h-fit md:h-full flex flex-col items-center md:justify-center justify-start px-4 md:px-0 mt-6 md:mt-0"
              >
                <Image
                  src="/assets/images/hero.png"
                  alt="Fundraising"
                  width={400}
                  height={400}
                  className="w-full max-w-[220px] md:max-w-[400px] h-fit object-cover"
                />
              </div>
            </div>
          </main>
        </div>

        <div
          ref={(el) => {
            slideRefs.current[1] = el;
          }}
          className={`${slideBaseClass} ${activeSlide === 1 ? "visible" : "invisible pointer-events-none"}`}
        >
       <main className="relative w-full md:h-[90vh] h-[90vh] overflow-hidden flex flex-col md:flex-row items-center justify-center text-center gap-10 sm:gap-12 md:gap-14 lg:gap-16 py-10 md:py-0">
       <div aria-hidden="true" data-fundraising-bg className="pointer-events-none absolute inset-0 bg-[#69D2EF]" />
            <div
              data-fundraising-content
              className="relative z-10 w-full flex flex-col items-center justify-center layout"
            >
              <h1
                className={
                  grobold.className +
                  " text-[#333333] font-medium text-xl md:text-6xl max-w-[90vw] md:max-w-4xl text-center mt-10 md:mt-0"
                }
              >
                Turn Sweet Treats into Big Fundraising Wins
              </h1>
              <p
                className={
                  grobold.className +
                  " text-[#333333] font-normal py-5 leading-tight font-inter " +
                  "text-sm md:text-2xl " +
                  "w-full max-w-[90vw] md:w-[900px] mx-auto"
                }
              >
                Raise funds with premium licorice your supporters will love
              </p>
              <div className="h-full w-full flex flex-col md:flex-row items-center justify-between">
                <Image
                  src="/assets/images/banner1lbox.png"
                  alt="Fundraising"
                  width={500}
                  height={500}
                  className="w-full max-w-[220px] md:max-w-[500px] h-auto"
                />
                <div className="w-full flex flex-col md:items-left items-center justify-center pl-10">
                  <Image
                    src="/assets/images/banner1rimg.png"
                    alt="Fundraising"
                    width={800}
                    height={800}
                    className="w-full max-w-[260px] md:max-w-[800px] h-auto"
                  />
                  <h2 className={"text-[#333333] font-extralight text-2xl md:text-3xl md:pl-9 pl-0 text-center md:text-left"}>
                    100% Online Fundraising
                  </h2>
                  <p className="text-[#333333] font-inter font-extralight text-base md:text-lg pl-0 md:pl-9 text-center md:text-left">
                    No Fee · No Minimums · Easy setup
                  </p>
                </div>
              </div>
              <CustomButton
                title="Learn More"
                className="font-bold text-white w-fit md:w-auto px-8 py-3 md:py-4 mt-4"
                href="https://lp.constantcontactpages.com/sl/kaaCahu/fundraise"
              />
            </div>
          </main>
        </div>

        <div
          ref={(el) => {
            slideRefs.current[2] = el;
          }}
          className={`${slideBaseClass} ${activeSlide === 2 ? "visible" : "invisible pointer-events-none"}`}
        >
           <main className="relative w-full md:h-[90vh] h-fit overflow-hidden flex flex-col items-center justify-between">
            <div aria-hidden="true" data-fundraising-bg className="pointer-events-none absolute inset-0 bg-[#FFB6D9]" />
            <div
              data-fundraising-content
              className="relative z-10 w-full flex flex-col items-center justify-start md:mt-24 mt-20"
            >
              <h1
                className={
                  grobold.className +
                  " text-[#333333] font-medium text-xl md:text-6xl max-w-[90vw] md:max-w-4xl text-center"
                }
              >
                Fundraising Made Simple & Profitable
              </h1>
              <p
                className={
                  grobold.className +
                  " text-[#333333] font-normal py-5 leading-tight font-inter text-center " +
                  "text-sm md:text-2xl " +
                  "w-full max-w-[90vw] md:w-[900px] mx-auto"
                }
              >
                Roise more in less time with our virtual fundraising system
              </p>
            </div>
            <div
              data-fundraising-content
              className="relative z-10 w-full lg:w-3/4 flex flex-col gap-10 md:gap-0 md:flex-row items-end justify-between mt-8 min-h-[350px] md:min-h-[400px] lg:min-h-[500px]"
            >
              <div className="flex justify-center md:justify-start w-full md:w-1/3 ">
                <Image
                  src={"/assets/images/Group-copy.png"}
                  alt=""
                  width={150}
                  height={150}
                  className="w-full max-w-[180px] md:max-w-[300px] h-auto md:absolute md:bottom-40 md:left-40"
                />
              </div>
              <div className="flex justify-center items-end w-full md:w-1/3 mb-4 md:mb-10">
                <CustomButton
                  title="Get Started Now"
                  className="font-bold text-white px-6 py-2 sm:px-8 sm:py-3 md:px-10 md:py-4"
                  href="https://lp.constantcontactpages.com/sl/kaaCahu/fundraise"
                />
              </div>
              <div className="flex justify-center md:justify-end w-full md:w-1/3 ">
                <Image
                  src={"/assets/images/girl.png"}
                  alt=""
                  width={200}
                  height={300}
                  className="w-full max-w-[140px] md:max-w-[400px] h-auto object-cover"
                />
              </div>
            </div>
          </main>
        </div>

        <button
          type="button"
          onClick={prevSlide}
          aria-label="Previous fundraising slide"
          className="absolute left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-white/80 md:left-5 md:inline-flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={nextSlide}
          aria-label="Next fundraising slide"
          className="absolute right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-white/80 md:right-5 md:inline-flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

      </div>
    </section>







    <section className="w-full bg-white md:hidden min-h-[90dvh] pb-[calc(env(safe-area-inset-bottom)+10px)]">
      <div
        className="relative w-full min-h-[85svh]  overflow-hidden"
        aria-roledescription="carousel"
        aria-label="Fundraising hero slider"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={(el) => {
            slideRefs.current[0] = el;
          }}
          className={`${slideBaseClass} ${activeSlide === 0 ? "visible" : "invisible pointer-events-none"}`}
        >
          <main className="bg-primary h-full min-h-[100svh]">
          <div aria-hidden="true" data-fundraising-bg className="pointer-events-none absolute inset-0 bg-primary" />
            <div 
            data-fundraising-content
            className="layout relative flex flex-col gap-5 items-center justify-center p-3">
             
                <h1
                  className={
                    grobold.className +
                    " text-white font-bold text-2xl text-center"
                  }
                >
                  Fundraising just got sweeter
                </h1>

                <p
                className={
                  grobold.className +
                  " text-white font-normal font-inter text-center"
                }
              >
                  Sell Southern Sweet &amp; Sour Licorice Ropes and keep 50% of every sale. No fees, no minimums, just success.
                </p>
                <Image src="/assets/images/arrow.webp" alt="Fundraising" width={100} height={100}/>

                  <CustomButton
                    title="Get Started Now"
                    className="font-bold text-white px-8 py-3"
                    href="https://lp.constantcontactpages.com/sl/kaaCahu/fundraise"
                  />

                <Image
                  src="/assets/images/hero.png"
                  alt="Fundraising"
                  width={400}
                  height={400}
                  className="w-full max-w-[220px] md:max-w-[400px] h-fit object-cover"
                />

            </div>
          </main>
        </div>

        <div
          ref={(el) => {
            slideRefs.current[1] = el;
          }}
          className={`${slideBaseClass} ${activeSlide === 1 ? "visible" : "invisible pointer-events-none"}`}
        >
       <main className="bg-[#69D2EF] h-full min-h-[100svh]">
       <div aria-hidden="true" data-fundraising-bg className="pointer-events-none absolute inset-0 bg-[#69D2EF]" />
            <div
              data-fundraising-content
              className="layout relative flex flex-col gap-5 items-center justify-center p-3"
            >
              <h1
                className={
                  grobold.className +
                  " text-[#333333] font-medium text-xl w-[90vw] text-center  "
                }
              >
                Turn Sweet Treats into Big Fundraising Wins
              </h1>
              <p
                className={
                  grobold.className +
                  " text-[#333333] font-normal font-inter text-center"
                }
              >
                Raise funds with premium licorice your supporters will love
              </p>

                <Image
                  src="/assets/images/banner1lbox.png"
                  alt="Fundraising"
                  width={200}
                  height={200}

                />
               
                  <Image
                    src="/assets/images/banner1rimg.png"
                    alt="Fundraising"
                    width={400}
                    height={400}

                  />
                  <h2 className={"text-[#333333] font-extralight text-2xl  text-center "}>
                    100% Online Fundraising
                  </h2>
                  <p className="text-[#333333] font-inter font-extralight text-base  text-center ">
                    No Fee · No Minimums · Easy setup
                  </p>

              <CustomButton
                title="Learn More"
                className="font-bold text-white w-fit px-8 py-3 "
                href="https://lp.constantcontactpages.com/sl/kaaCahu/fundraise"
              />
            </div>
          </main>
        </div>

        <div
          ref={(el) => {
            slideRefs.current[2] = el;
          }}
          className={`${slideBaseClass} ${activeSlide === 2 ? "visible" : "invisible pointer-events-none"}`}
        >
           <main className="bg-[#FFB6D9] h-full min-h-[100svh]">
            <div aria-hidden="true" data-fundraising-bg className="pointer-events-none absolute inset-0 bg-[#FFB6D9]" />
            <div
              data-fundraising-content
              className="layout relative flex flex-col gap-5 items-center justify-center p-3"
            >
              <h1
                className={
                  grobold.className +
                  " text-[#333333] font-medium text-xl text-center"
                }
              >
                Fundraising Made Simple & Profitable
              </h1>
              <p
                className={
                  grobold.className +
                  " text-[#333333] font-normal text-center " 
                }
              >
                Roise more in less time with our virtual fundraising system
              </p>
            </div>
            <div
              data-fundraising-content
              className="relative  w-full flex flex-col gap-10  items-center justify-between mt-8 "
            >
                <Image
                  src={"/assets/images/Group-copy.png"}
                  alt=""
                  width={150}
                  height={150}
                  className="w-full max-w-[180px]  h-auto "
                />
                <CustomButton
                  title="Get Started Now"
                  className="font-bold text-white px-6 py-2 sm:px-8 sm:py-3 md:px-10 md:py-4"
                  href="https://lp.constantcontactpages.com/sl/kaaCahu/fundraise"
                />

                <Image
                  src={"/assets/images/girl.png"}
                  alt=""
                  width={200}
                  height={300}

                />

            </div>
          </main>
        </div>

        <button
          type="button"
          onClick={prevSlide}
          aria-label="Previous fundraising slide"
          className="absolute left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-white/80 md:left-5 md:inline-flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={nextSlide}
          aria-label="Next fundraising slide"
          className="absolute right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-white/80 md:right-5 md:inline-flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

      </div>
    </section>
    </>
  );
};

export default Fundraising;
