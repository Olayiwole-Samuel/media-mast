// Radio rate update from "Radio Media plan.xlsx" (sheet "30secs Jingle Plan"):
// 30-second jingles, Monday to Friday prime-time belts, 26 radio stations.
// Prices are the gross rate card amounts. Existing media houses
// (existing: true) have these merged into their rate card; new ones are
// created. Loaded by: node src/scripts/importRateUpdate.js --set=radio-plan
module.exports = { RATE_UPDATE_RADIO_PLAN: [
 {
  "name": "Bond 92.9 FM",
  "slug": "bond-92-9-fm",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (6am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6200,
    "isActive": true
   },
   {
    "name": "Prime Time (3:30pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "15:30",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6200,
    "isActive": true
   }
  ]
 },
 {
  "name": "Wazobia FM 95.1 Lagos",
  "slug": "wazobia-fm-lagos",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 16875,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 16875,
    "isActive": true
   }
  ]
 },
 {
  "name": "Nigeria Info 99.3 Lagos",
  "slug": "nigeria-info-lagos",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 14850,
    "isActive": true
   }
  ]
 },
 {
  "name": "Cool FM 96.9 Lagos",
  "slug": "cool-fm-lagos",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13125,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13125,
    "isActive": true
   }
  ]
 },
 {
  "name": "Inspiration FM 92.3 Lagos",
  "slug": "inspiration-fm-lagos",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13750,
    "isActive": true
   },
   {
    "name": "Prime Time (3pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "15:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13750,
    "isActive": true
   }
  ]
 },
 {
  "name": "Faaji FM",
  "slug": "faaji-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (6am–10am)",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "10:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8350.73,
    "isActive": true
   },
   {
    "name": "Prime Time (2pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "14:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5854.65,
    "isActive": true
   }
  ]
 },
 {
  "name": "Radio Lagos (Tiwa n' Tiwa)",
  "slug": "radio-lagos-tiwa-n-tiwa",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Marose (5am–8am)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "08:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7780,
    "isActive": true
   },
   {
    "name": "Nifaji (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6880,
    "isActive": true
   }
  ]
 },
 {
  "name": "Sweet FM Abeokuta",
  "slug": "sweet-fm-abeokuta",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Abeokuta",
   "state": "Ogun",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8000,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–7pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "19:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Smash FM Abeokuta",
  "slug": "smash-fm-abeokuta",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Abeokuta",
   "state": "Ogun",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12500,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–7pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "19:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12500,
    "isActive": true
   }
  ]
 },
 {
  "name": "Agidigbo 88.7 FM",
  "slug": "agidigbo-88-7-fm",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Ibadan",
   "state": "Oyo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–2pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "14:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9580,
    "isActive": true
   },
   {
    "name": "Prime Time (6pm–11pm)",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "23:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9580,
    "isActive": true
   }
  ]
 },
 {
  "name": "Splash FM",
  "slug": "splash-fm",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Ibadan",
   "state": "Oyo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10266.25,
    "isActive": true
   },
   {
    "name": "Prime Time (2pm–8pm)",
    "kind": "TIME_BELT",
    "startTime": "14:00",
    "endTime": "20:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10266.25,
    "isActive": true
   }
  ]
 },
 {
  "name": "Unique FM Ilesa",
  "slug": "unique-fm-ilesa",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Ilesa",
   "state": "Osun",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (6am–11am)",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "11:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6700,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6700,
    "isActive": true
   }
  ]
 },
 {
  "name": "Rave FM",
  "slug": "rave-fm",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Osogbo",
   "state": "Osun",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (6am–11am)",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "11:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4950,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4950,
    "isActive": true
   }
  ]
 },
 {
  "name": "Crest FM Akure",
  "slug": "crest-fm-akure",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Akure",
   "state": "Ondo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–11:59am)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "11:59",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8000,
    "isActive": true
   },
   {
    "name": "Prime Time (12pm–7pm)",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "19:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7500,
    "isActive": true
   }
  ]
 },
 {
  "name": "Adaba FM Akure",
  "slug": "adaba-fm-akure",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Akure",
   "state": "Ondo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–11:59am)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "11:59",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10000,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Golden Voice of Ekiti FM",
  "slug": "golden-voice-of-ekiti-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Ado-Ekiti",
   "state": "Ekiti",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (6am–11am)",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "11:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5348,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5348,
    "isActive": true
   }
  ]
 },
 {
  "name": "Midland FM Ilorin",
  "slug": "midland-fm-ilorin",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Ilorin",
   "state": "Kwara",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6300,
    "isActive": true
   },
   {
    "name": "Prime Time (3pm–9pm)",
    "kind": "TIME_BELT",
    "startTime": "15:00",
    "endTime": "21:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6300,
    "isActive": true
   }
  ]
 },
 {
  "name": "Wazobia FM 99.5 Abuja",
  "slug": "wazobia-fm-abuja",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Abuja",
   "state": "FCT (Abuja)",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8700,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8700,
    "isActive": true
   }
  ]
 },
 {
  "name": "Cool FM 96.9 Abuja",
  "slug": "cool-fm-abuja",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Abuja",
   "state": "FCT (Abuja)",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7063,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7063,
    "isActive": true
   }
  ]
 },
 {
  "name": "Rhythm FM Jos",
  "slug": "rhythm-fm-jos",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Jos",
   "state": "Plateau",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–11am)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "11:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 3000,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–6pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "18:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 3000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Jay FM Jos",
  "slug": "jay-fm-jos",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Jos",
   "state": "Plateau",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–11am)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "11:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5000,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–6pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "18:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5000,
    "isActive": true
   }
  ]
 },
 {
  "name": "KSMC",
  "slug": "ksmc",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Kaduna",
   "state": "Kaduna",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (6am–11am)",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "11:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6200,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6200,
    "isActive": true
   }
  ]
 },
 {
  "name": "Invicta FM Kaduna",
  "slug": "invicta-fm-kaduna",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Kaduna",
   "state": "Kaduna",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (6am–11am)",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "11:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6115,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6115,
    "isActive": true
   }
  ]
 },
 {
  "name": "Wazobia FM 95.1 Kano",
  "slug": "wazobia-fm-kano",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Kano",
   "state": "Kano",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5200,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5200,
    "isActive": true
   }
  ]
 },
 {
  "name": "Arewa Radio 93.1 Kano",
  "slug": "arewa-radio-kano",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Kano",
   "state": "Kano",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6290,
    "isActive": true
   },
   {
    "name": "Prime Time (4pm–10pm)",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6290,
    "isActive": true
   }
  ]
 },
 {
  "name": "Freedom Radio",
  "slug": "freedom-radio",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Kano",
   "state": "Kano",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime Time (5:30am–12pm)",
    "kind": "TIME_BELT",
    "startTime": "05:30",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6832.5,
    "isActive": true
   },
   {
    "name": "Prime Time (12pm–7pm)",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "19:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6832.5,
    "isActive": true
   }
  ]
 }
] };
