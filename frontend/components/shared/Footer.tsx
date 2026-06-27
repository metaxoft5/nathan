"use client"
import React from "react";
import CustomButton from "../custom/CustomButton";
import FaqList from "@/components/shared/FaqList";
import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react";
import { Links } from "@/constant";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";

const Footer = () => {
  const router = useRouter()
  const {user} = useUser()
  const handleAuthButtonClick = () =>{
    if(user){
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true })
        .then(()=>router.replace("/"))
        .catch(()=>{})
    }else{
      router.push("/auth/register")
    }
  }

  return (
    <footer className="bg-primary layout  z-50 mb-10 h-auto min-h-[500px] w-full border-t border-white">
      <div className="flex flex-col md:flex-row justify-between items-start py-8 md:py-10 gap-8 md:gap-0">
        <div className="flex flex-col justify-center items-start  w-full md:w-[48%] h-full pb-8 md:pb-0 md:pr-6">
          <CustomButton
            title={user ? "Logout" : "Sign up"}
            className="bg-white !text-primary font-inter font-bold rounded-md"
            onClick={handleAuthButtonClick}
          />
          <p className="text-white text-16 font-inter font-bold pt-8 md:pt-10 w-full">
            If there are questions you want to ask, we will answer all your
            question
          </p>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 md:pt-10 w-full">
            <input
              type="text"
              placeholder="Enter your email"
              className="bg-transparent border-b border-white w-full text-white placeholder:text-white placeholder:text-16 placeholder:font-inter"
            />
            <CustomButton
              title="Join now"
              className="!bg-primary !text-white font-inter font-bold rounded-md w-full sm:w-1/2 mt-4 sm:mt-0"
            />
          </div>
        </div>
        <div className="w-full md:w-[52%] flex flex-col items-center md:items-end justify-center px-0 md:px-6">
          <p className="text-white text-16 font-inter font-bold mb-8 md:mb-10 text-center md:text-left max-w-full md:max-w-md w-full">
            If there are questions you want to ask, we will answer all your
            questions
          </p>
          <FaqList />
        </div>
      </div>
      <div className="w-full flex flex-col md:flex-row items-center justify-between py-5 border-t border-white gap-6 md:gap-0">
        <div className="flex items-center justify-center md:justify-start w-full md:w-[20%] gap-4 mb-4 md:mb-0">
          <Facebook className="text-white text-24" />
          <Instagram className="text-white text-24" />
          <Twitter className="text-white text-24" />
          <Linkedin className="text-white text-24" />
        </div>
        <div className="flex flex-wrap items-center justify-center w-full md:w-[30%] gap-4 md:gap-8">
          {Links.map((link) => {
            return (
              <Link href={link.href} key={link.label} className="no-underline">
                <span
                  className="font-inter font-medium text-[14px]
                 leading-[150%] tracking-[0] transition-all duration-300 text-white
                 hover:text-secondary active:text-secondary focus:text-secondary
                 no-underline"
                >
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="flex flex-col items-center md:items-end justify-center w-full md:w-[50%] mt-4 md:mt-0">
          <h6 className="text-white text-16 font-inter font-bold text-center md:text-right max-w-full md:max-w-md w-full">
            © Metaxoft All Rights Reserved
          </h6>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
