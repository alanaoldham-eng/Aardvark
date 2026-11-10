// Sample data for the Aardvark prototype. Swap for real API calls once a backend exists.
window.AARDVARK_DATA = {
  van: { id: "van-1", name: "Van 1", zone: "Midtown Mobile", groomer: "Lead Groomer",
         depot: { lat: 30.6990, lng: -88.1520, label: "Depot" } },

  pets: [
    { id: "luna",   name: "Luna",   species: "Dog", breed: "Golden Retriever",    age: 4, weight: 68, coat: "Heavy double coat", photo: "dog-golden",  owner: "The Whitfields", phone: "(251) 555-0142", area: "Spring Hill", cadenceWeeks: 6, notes: "Loves the dryer on low. Check ears.", lastGroom: -40 },
    { id: "mochi",  name: "Mochi",  species: "Dog", breed: "Poodle",              age: 3, weight: 22, coat: "Curly, kept short", photo: "dog-poodle",  owner: "Dana R.",        phone: "(251) 555-0187", area: "Midtown",     cadenceWeeks: 5, notes: "Sensitive skin — hypoallergenic shampoo only.", tags: ["Regular", "Sensitive skin"], lastGroom: -34 },
    { id: "harper", name: "Harper", species: "Cat", breed: "Domestic Shorthair",  age: 7, weight: 11, coat: "Short",             photo: "cat",         owner: "M. Alvarez",     phone: "(251) 555-0119", area: "Oakleigh",    cadenceWeeks: 8, notes: "Nail trim only. Use towel wrap.", lastGroom: -55 },
    { id: "ranger", name: "Ranger", species: "Dog", breed: "Australian Shepherd", age: 5, weight: 52, coat: "Heavy double coat", photo: "dog-aussie",  owner: "Chris & Pat L.", phone: "(251) 555-0163", area: "Leinkauf",    cadenceWeeks: 6, notes: "De-shed treatment add-on every visit.", lastGroom: -43 },
    { id: "bella",  name: "Bella",  species: "Dog", breed: "Shih Tzu",            age: 9, weight: 14, coat: "Long, prone to mats", photo: "dog-shihtzu", owner: "Gloria T.",      phone: "(251) 555-0131", area: "De Tonti Square", cadenceWeeks: 5, notes: "Senior — short table sessions, breaks as needed.", lastGroom: -36 },
    { id: "biscuit",name: "Biscuit",species: "Dog", breed: "Goldendoodle",        age: 2, weight: 48, coat: "Fleece, mats easily", photo: "dog-doodle", owner: "The Nguyens",    phone: "(251) 555-0175", area: "Spring Hill", cadenceWeeks: 5, notes: "Teddy bear cut, 1/2\" body.", lastGroom: -12 },
    { id: "pepper", name: "Pepper", species: "Dog", breed: "Miniature Schnauzer", age: 6, weight: 17, coat: "Wiry",              photo: "dog-schnauzer", owner: "R. Daniels",   phone: "(251) 555-0108", area: "Midtown",     cadenceWeeks: 6, notes: "Classic schnauzer pattern.", lastGroom: -20 }
  ],

  // Today's route, in order. Coordinates are approximate neighborhood centers.
  appointments: [
    { id: "a1", petId: "luna",   time: "08:00", service: "Bath + Full Groom", price: 95, mins: 90, drive: 12, lat: 30.6935, lng: -88.1310 },
    { id: "a2", petId: "mochi",  time: "09:30", service: "Bath + Trim",       price: 80, mins: 75, drive: 8,  lat: 30.6873, lng: -88.1105 },
    { id: "a3", petId: "harper", time: "11:00", service: "Nail Trim",         price: 35, mins: 20, drive: 12, lat: 30.6810, lng: -88.0935 },
    { id: "a4", petId: "ranger", time: "13:00", service: "Full Groom + De-shed", price: 105, mins: 105, drive: 10, lat: 30.6845, lng: -88.0705 },
    { id: "a5", petId: "bella",  time: "15:00", service: "Bath + Tidy",       price: 70, mins: 60, drive: 9,  lat: 30.6912, lng: -88.0478 }
  ],

  weekly: { bookings: 48, bookingsDelta: 12, revenue: 3420, revenueDelta: 18, rebookRate: 86,
            trend: [2310, 2480, 2420, 2690, 2760, 2950, 3100, 3420] },

  courses: [
    { id: "skin", title: "Canine Skin & Coat Health", photo: "dog-golden", duration: "1h 20m",
      modules: [["Skin anatomy & coat types", true], ["Spotting hot spots & parasites", true], ["Matting: causes and safe removal", true], ["When to refer to a vet", true]] },
    { id: "bath", title: "Professional Bathing Techniques", photo: "dog-poodle", duration: "55m",
      modules: [["Water temperature & pre-rinse", true], ["Shampoo selection by coat", true], ["High-velocity drying safely", false]] },
    { id: "feline", title: "Feline Grooming Basics", photo: "cat", duration: "1h 45m",
      modules: [["Reading feline body language", true], ["Safe handling & towel wraps", true], ["Nail trims", false], ["Lion cuts & sanitary trims", false], ["Low-stress cat bathing", false]] },
    { id: "comms", title: "Client Communication", photo: "dog-shihtzu", duration: "30m",
      modules: [["Doorstep check-in script", false], ["Talking about matting & shave-downs", false]] },
    { id: "tools", title: "Tool Mechanics", photo: "dog-golden", duration: "1h 10m",
      modules: [["Clipper blades & guard combs", true], ["Scissors, shears & thinners", false], ["Reading the grooming manual", false], ["Tool mechanics quiz", false]] },
    { id: "shadow", title: "Prep, Safety & Shadowing", photo: "dog-golden", duration: "16 hrs/wk",
      modules: [["Shadowing your mentor groomer", true], ["Nail grinding", true], ["Sanitary trim", false], ["Bath & blowout", false]] }
  ]
};
