import './fonts.css';
import asset0 from "./assets/lp-14-gal1.png";
import asset1 from "./assets/lp-14-gal2.png";
import asset2 from "./assets/lp-14-hero.png";

import React from "react";
import { ArrowRight, Instagram, Twitter, Mail } from "lucide-react";

export const Lp14 = () => {
  return (
    <div
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
      className="bg-[#050505] text-[#ececec] font-['Inter',sans-serif] flex flex-col relative selection:bg-white selection:text-black"
    >
      {/* Decorative Grid Lines */}
      <div className="absolute inset-0 pointer-events-none z-0 flex justify-between px-16">
        <div className="w-px h-full bg-white/[0.03]"></div>
        <div className="w-px h-full bg-white/[0.03]"></div>
        <div className="w-px h-full bg-white/[0.03]"></div>
        <div className="w-px h-full bg-white/[0.03]"></div>
      </div>
      <div className="absolute top-24 left-0 w-full h-px bg-white/[0.03] z-0"></div>
      <div className="absolute bottom-20 left-0 w-full h-px bg-white/[0.03] z-0"></div>

      {/* Header */}
      <header className="flex items-center justify-between px-16 h-24 shrink-0 z-10">
        <div className="font-['Playfair_Display'] text-2xl tracking-[0.2em] uppercase font-semibold">
          Elias Vance
        </div>
        
        <nav className="flex gap-14 text-[11px] tracking-[0.25em] uppercase font-medium text-white/50">
          <a href="#" className="text-white">Selected Works</a>
          <a href="#" className="hover:text-white transition-colors">Exhibitions</a>
          <a href="#" className="hover:text-white transition-colors">Publications</a>
          <a href="#" className="hover:text-white transition-colors">Journal</a>
        </nav>
        
        <button className="text-[11px] tracking-[0.2em] uppercase font-medium border border-white/20 px-8 py-3 hover:bg-white hover:text-black transition-all duration-300">
          Inquire
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex px-16 py-12 gap-16 z-10">
        {/* Left Column */}
        <div className="w-[40%] flex flex-col justify-between">
          <div className="pt-4">
            <div className="text-[10px] tracking-[0.3em] uppercase text-white/40 mb-8 flex items-center gap-4">
              <span className="w-8 h-px bg-white/40"></span>
              Fine Art Landscape Photography
            </div>
            
            <h1 className="font-['Playfair_Display'] text-[80px] leading-[0.95] mb-8 font-medium">
              <span className="block text-white/40 text-6xl mb-2">The</span> 
              <span className="block">Silent</span> 
              <span className="block">Earth.</span>
            </h1>
            
            <p className="text-white/50 text-[15px] leading-[1.8] max-w-[380px] font-light mb-12">
              A study in isolation, contrast, and the enduring monumental scale of the natural world. Captured entirely on medium format black and white film across the American West and the Nordic highlands.
            </p>
          </div>
          
          {/* Bottom Left Image (16:9) */}
          <div className="w-full group cursor-pointer">
            <div className="w-full relative overflow-hidden bg-white/5 mb-4">
              <img 
                src={asset1} 
                className="w-full aspect-video object-cover grayscale hover:grayscale-0 opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-1000 ease-out" 
                alt="Ocean waves" 
              />
            </div>
            <div className="flex justify-between items-center text-[10px] tracking-[0.2em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
              <span>01 &mdash; The Obsidian Coast</span>
              <span>Iceland, 2023</span>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="w-[60%] flex gap-8 h-full">
          {/* Center Main Hero Image (3:4) */}
          <div className="w-[65%] h-full group cursor-pointer relative overflow-hidden">
            <img 
              src={asset2} 
              className="w-full h-full object-cover grayscale opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-1000 ease-out" 
              alt="Monolith mountains" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>
            
            <div className="absolute bottom-0 left-0 p-8 w-full translate-y-4 group-hover:translate-y-0 transition-transform duration-500 ease-out">
              <div className="flex items-center justify-between w-full">
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-white/60 mb-2">02 &mdash; Monolith</div>
                  <div className="font-['Playfair_Display'] text-2xl text-white">Yosemite Valley</div>
                </div>
                <div className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity delay-100 bg-white/10 backdrop-blur-sm">
                  <ArrowRight className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Small Images & CTA */}
          <div className="w-[35%] flex flex-col justify-end h-full">
            {/* Top Right Image (3:4) */}
            <div className="w-full group cursor-pointer mb-12">
              <div className="w-full relative overflow-hidden bg-white/5 mb-4">
                <img 
                  src={asset0} 
                  className="w-full h-[320px] object-cover grayscale opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-1000 ease-out" 
                  alt="Solitary desert tree" 
                />
              </div>
              <div className="flex flex-col text-[10px] tracking-[0.2em] uppercase text-white/40 gap-2 group-hover:text-white/80 transition-colors">
                <span>03 &mdash; Solitude</span>
                <span className="text-white/20">Death Valley, 2022</span>
              </div>
            </div>
            
            {/* Exhibition CTA Block */}
            <div className="bg-white/[0.02] p-8 border border-white/[0.05] hover:border-white/20 hover:bg-white/[0.04] transition-all duration-500 cursor-pointer group flex flex-col items-start relative overflow-hidden">
              <div className="absolute top-0 left-0 w-0 h-0.5 bg-white group-hover:w-full transition-all duration-700 ease-out"></div>
              
              <div className="text-[10px] tracking-[0.2em] uppercase text-white/40 mb-4">Upcoming</div>
              <div className="font-['Playfair_Display'] text-2xl mb-2 text-white">NYC Gallery<br/>Exhibition</div>
              <div className="text-sm text-white/40 mb-8 font-light italic">Oct 12 &mdash; Nov 24, 2024</div>
              
              <div className="mt-auto flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-white/70 group-hover:text-white transition-colors">
                View Details
                <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Socials */}
      <footer className="h-20 shrink-0 flex items-center justify-between px-16 z-10 text-[10px] tracking-[0.2em] uppercase text-white/30">
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-white transition-colors flex items-center gap-2"><Instagram className="w-3 h-3" /> Instagram</a>
          <a href="#" className="hover:text-white transition-colors flex items-center gap-2"><Twitter className="w-3 h-3" /> Twitter</a>
          <a href="#" className="hover:text-white transition-colors flex items-center gap-2"><Mail className="w-3 h-3" /> Contact</a>
        </div>
        
        <div>&copy; 2024 Elias Vance. All Rights Reserved.</div>
      </footer>
    </div>
  );
};

export { Lp14 as "lp-14" };

