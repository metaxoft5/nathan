import React from "react";
import AnimatedText from "@/components/custom/AnimatedText";

const data = [
    {
        title: "3x",
        subtitle: "increase in sales",
        description: "Groups that switch from traditional brochure fundraising to virtual fundraising see sales go up threefold.",
    },
    {
        title: "$360",
        subtitle: "average per seller",
        description: "An average seller should be able to make between 10-15 sales over a 5 day fundraiser.",
    },
    {
        title: "$3,500",
        subtitle: "average per team",
        description: "Most teams of 20 sellers can expect to earn about $3,500.",
    },
];

const VirtualFund = () => {
  return (
    <section className="w-full min-h-ful flex flex-col items-center justify-center bg-white py-8 md:py-12 lg:py-16 px-4 md:px-8">
      <div className="w-full flex flex-col items-center justify-center relative gap-6 md:gap-8 lg:gap-10 layout">
        <AnimatedText
          text="Virtual fundraising with real results"
          className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl font-bold text-center max-w-4xl text-black leading-tight"
          splitBy="word"
          stagger={0.1}
          duration={0.3}
        />
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8 xl:gap-10">
          {data.map((item, index) => (
            <div key={index} className="w-full flex flex-col items-center justify-center gap-3 md:gap-4 lg:gap-5 p-4 md:p-6 lg:p-8 bg-white rounded-lg transition-all duration-300">
              <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-bold text-black text-center leading-tight">
                {item.title}
              </h1>
              <h3 className="text-base md:text-lg lg:text-xl xl:text-2xl font-semibold text-black text-center leading-relaxed">
                {item.subtitle}
              </h3>
              <p className="text-xs md:text-sm lg:text-base xl:text-lg font-light text-black text-center leading-relaxed max-w-sm">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default VirtualFund;
