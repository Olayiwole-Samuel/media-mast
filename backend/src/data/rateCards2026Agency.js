// Rate update from four agency plans (Nov 2026): radio 30s and 45s, radio
// time checks (5s) and TV 15s. Generated from the sheets; existing media
// houses (existing: true) have these rates merged into their rate card,
// new ones are created. Prices are rate card amounts (with any fixed-time
// surcharge added). Loaded by src/scripts/importRateUpdate.js.
module.exports = { RATE_UPDATE_2026: [
 {
  "name": "Bond 92.9 FM",
  "slug": "bond-92-9-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Koko",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "09:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 17894,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6760,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 8060,
    "isActive": true
   },
   {
    "name": "ROS Weekend",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 30,
    "days": [
     0,
     6
    ],
    "price": 8060,
    "isActive": true
   },
   {
    "name": "Koko",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "09:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 21710,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9490,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10790,
    "isActive": true
   },
   {
    "name": "ROS Weekend",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     0,
     6
    ],
    "price": 10790,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 20000,
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
    "name": "ROS Morning",
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
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 14875,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 21125,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 19375,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 21125,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 45000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Lounge FM",
  "slug": "lounge-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 11116,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11116,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 11116,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13331,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13331,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13331,
    "isActive": true
   }
  ]
 },
 {
  "name": "Beat 99.9 FM Lagos",
  "slug": "beat-99-9-fm-lagos",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "09:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11252,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9660,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "21:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11252,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "09:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 15753,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13524,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "21:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 15753,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 20000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Lasgidi 90.1 FM",
  "slug": "lasgidi-90-1-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 9000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9000,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 9000,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11000,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11000,
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
    "name": "ROS Morning",
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
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
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
    "name": "ROS Evening",
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
    "price": 13750,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 16200,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12000,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 16200,
    "isActive": true
   }
  ]
 },
 {
  "name": "Max 102.3 FM",
  "slug": "max-102-3-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 14500,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10350,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 14500,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 17450,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 14900,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "15:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 17450,
    "isActive": true
   }
  ]
 },
 {
  "name": "Soundcity 96.5 FM Port Harcourt",
  "slug": "soundcity-96-5-fm-port-harcourt",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Port Harcourt",
   "state": "Rivers",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13020,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8680,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 8680,
    "isActive": true
   },
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 16380,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10920,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10920,
    "isActive": true
   }
  ]
 },
 {
  "name": "Wave 91.7 FM Port Harcourt",
  "slug": "wave-91-7-fm-port-harcourt",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Port Harcourt",
   "state": "Rivers",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 6000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5100,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 6000,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6750,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5738,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6750,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Naija FM Port Harcourt",
  "slug": "naija-fm-port-harcourt",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Port Harcourt",
   "state": "Rivers",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "09:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7827.82,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6806.8,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "21:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7827.82,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "09:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10176.17,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8815.61,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "21:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10176.17,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 16000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Beat 99.9 FM Port Harcourt",
  "slug": "beat-99-9-fm-port-harcourt",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Port Harcourt",
   "state": "Rivers",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8820,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5113.05,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "21:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5880,
    "isActive": true
   },
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12348,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7158.27,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8232,
    "isActive": true
   },
   {
    "name": "The Kitchen",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Cool FM 95.9 Port Harcourt",
  "slug": "cool-fm-ph",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Port Harcourt",
   "state": "Rivers",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 06:00",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "09:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 14750,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6438,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 7375,
    "isActive": true
   },
   {
    "name": "Fixed time 06:00",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "09:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 18500,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
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
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9250,
    "isActive": true
   }
  ]
 },
 {
  "name": "Sapientia 95.3 FM Onitsha",
  "slug": "sapientia-95-3-fm-onitsha",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Onitsha",
   "state": "Anambra",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 24000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10400,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 12000,
    "isActive": true
   },
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 27000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12600,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13500,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 15000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Odenigbo 99.1 FM",
  "slug": "odenigbo-99-1-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Obosi",
   "state": "Anambra",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 10000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 10000,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Blaze 91.5 FM",
  "slug": "blaze-91-5-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Oraifite",
   "state": "Anambra",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 09:00",
    "kind": "TIME_BELT",
    "startTime": "09:00",
    "endTime": "10:30",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 18750,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 12500,
    "isActive": true
   },
   {
    "name": "Fixed time 09:00",
    "kind": "TIME_BELT",
    "startTime": "09:00",
    "endTime": "10:30",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 20250,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 13500,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
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
  "name": "Voice of Delta 97.9 FM",
  "slug": "voice-of-delta-97-9-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Asaba",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7800,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4900,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
   },
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12750,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8500,
    "isActive": true
   }
  ]
 },
 {
  "name": "DBS 88.6 FM Warri",
  "slug": "dbs-88-6-fm-warri",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Warri",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 8600,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
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
   },
   {
    "name": "ROS Evening",
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
    "price": 8600,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10500,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10500,
    "isActive": true
   }
  ]
 },
 {
  "name": "Trend 100.9 FM",
  "slug": "trend-100-9-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Asaba",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 09:00",
    "kind": "TIME_BELT",
    "startTime": "09:00",
    "endTime": "10:30",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6000,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 6000,
    "isActive": true
   },
   {
    "name": "Fixed time 09:00",
    "kind": "TIME_BELT",
    "startTime": "09:00",
    "endTime": "10:30",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
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
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
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
  "name": "Crown 94.7 FM Asaba",
  "slug": "crown-94-7-fm-asaba",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Asaba",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 09:00",
    "kind": "TIME_BELT",
    "startTime": "09:00",
    "endTime": "10:30",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8250,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 5500,
    "isActive": true
   },
   {
    "name": "Fixed time 09:00",
    "kind": "TIME_BELT",
    "startTime": "09:00",
    "endTime": "10:30",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10500,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7000,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7000,
    "isActive": true
   }
  ]
 },
 {
  "name": "FLO 94.9 FM",
  "slug": "flo-94-9-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Umuahia",
   "state": "Abia",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 5096,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 5096,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7280,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7280,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
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
  "name": "Magic 102.9 FM",
  "slug": "magic-102-9-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Aba",
   "state": "Abia",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "12:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8775,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "20:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8775,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9725,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "20:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9725,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Comfort FM Uyo",
  "slug": "comfort-fm-uyo",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Uyo",
   "state": "Akwa Ibom",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 4455,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 4455,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7695,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7695,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 30000,
    "isActive": true
   }
  ]
 },
 {
  "name": "AKBC FM Uyo",
  "slug": "akbc-fm-uyo",
  "existing": true,
  "type": "RADIO",
  "location": {
   "city": "Uyo",
   "state": "Akwa Ibom",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 6500,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 6500,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10600,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10600,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Sparkling 92.3 FM",
  "slug": "sparkling-92-3-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Calabar",
   "state": "Cross River",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 5500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 5500,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6500,
    "isActive": true
   }
  ]
 },
 {
  "name": "Hit 95.9 FM",
  "slug": "hit-95-9-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Calabar",
   "state": "Cross River",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 7956,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7956,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 7956,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9360,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9360,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9360,
    "isActive": true
   }
  ]
 },
 {
  "name": "Urban Radio 94.5 FM",
  "slug": "urban-radio-94-5-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Enugu",
   "state": "Enugu",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 7500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 7500,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8500,
    "isActive": true
   }
  ]
 },
 {
  "name": "Solid 100.9 FM",
  "slug": "solid-100-9-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Enugu",
   "state": "Enugu",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 3500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 3500,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4600,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4600,
    "isActive": true
   }
  ]
 },
 {
  "name": "Oluyole 98.5 FM (BCOS)",
  "slug": "oluyole-98-5-fm-bcos",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Ibadan",
   "state": "Oyo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 4410,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 4410,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5040,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5040,
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
    "name": "ROS Morning",
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
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6987.5,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 10266.25,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12362.5,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 8610.73,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12362.5,
    "isActive": true
   }
  ]
 },
 {
  "name": "R2 FM",
  "slug": "r2-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Ibadan",
   "state": "Oyo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 6700,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
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
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
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
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 15000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Crown 101.5 FM Osogbo",
  "slug": "crown-101-5-fm-osogbo",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Osogbo",
   "state": "Osun",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 10000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6000,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
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
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
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
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 15000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Gold 95.5 FM",
  "slug": "gold-95-5-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Ilesa",
   "state": "Osun",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 3538.29,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 3538.29,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 3538.29,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4434.38,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4434.38,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4434.38,
    "isActive": true
   }
  ]
 },
 {
  "name": "Hot FM 98.3 Owerri",
  "slug": "hot-fm-98-3-owerri",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Owerri",
   "state": "Imo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "name": "ROS Evening",
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
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7150,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7150,
    "isActive": true
   }
  ]
 },
 {
  "name": "Darling FM",
  "slug": "darling-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Owerri",
   "state": "Imo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 8500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 8500,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 11500,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Heartland 100.5 FM",
  "slug": "heartland-100-5-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Owerri",
   "state": "Imo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 3500,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 3500,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "05:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4200,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4200,
    "isActive": true
   },
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Speed 96.9 FM",
  "slug": "speed-96-9-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Benin City",
   "state": "Edo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 7725,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "14:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4700,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 5150,
    "isActive": true
   },
   {
    "name": "Fixed time 07:00",
    "kind": "TIME_BELT",
    "startTime": "07:00",
    "endTime": "08:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9300,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "14:00",
    "spotSeconds": 45,
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
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
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
  "name": "B-Side FM",
  "slug": "b-side-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Benin City",
   "state": "Edo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "ROS Morning",
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
    "price": 5000,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 30,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 4400,
    "isActive": true
   },
   {
    "name": "ROS Evening",
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
    "price": 5000,
    "isActive": true
   },
   {
    "name": "ROS Morning",
    "kind": "TIME_BELT",
    "startTime": "06:00",
    "endTime": "12:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5950,
    "isActive": true
   },
   {
    "name": "ROS Afternoon",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "16:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5150,
    "isActive": true
   },
   {
    "name": "ROS Evening",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "22:00",
    "spotSeconds": 45,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 5950,
    "isActive": true
   }
  ]
 },
 {
  "name": "Africa Magic Epic (GOtv)",
  "slug": "africa-magic-epic-gotv",
  "existing": false,
  "type": "TV",
  "location": {
   "city": null,
   "state": null,
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Primetime ROS",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [],
    "price": 140000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Africa Magic Yoruba (GOtv)",
  "slug": "africa-magic-yoruba-gotv",
  "existing": false,
  "type": "TV",
  "location": {
   "city": null,
   "state": null,
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Primetime ROS",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [],
    "price": 140000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Africa Magic Family (GOtv)",
  "slug": "africa-magic-family-gotv",
  "existing": false,
  "type": "TV",
  "location": {
   "city": null,
   "state": null,
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Primetime ROS",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [],
    "price": 160000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Zee World",
  "slug": "zee-world",
  "existing": false,
  "type": "TV",
  "location": {
   "city": null,
   "state": null,
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Primetime ROS",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 175000,
    "isActive": true
   }
  ]
 },
 {
  "name": "StarTimes",
  "slug": "startimes",
  "existing": false,
  "type": "TV",
  "location": {
   "city": null,
   "state": null,
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Isi Mbido",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [],
    "price": 170000,
    "isActive": true
   },
   {
    "name": "Orisun",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [],
    "price": 170000,
    "isActive": true
   },
   {
    "name": "Blackdrum",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [],
    "price": 150000,
    "isActive": true
   }
  ]
 },
 {
  "name": "NTA Network",
  "slug": "nta-network",
  "existing": true,
  "type": "TV",
  "location": {
   "city": null,
   "state": null,
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Superstory",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     4
    ],
    "price": 300000,
    "isActive": true
   },
   {
    "name": "Papa Ajasco",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     2
    ],
    "price": 200000,
    "isActive": true
   },
   {
    "name": "Network News",
    "kind": "TIME_BELT",
    "startTime": "21:00",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5,
     6
    ],
    "price": 372093.02,
    "isActive": true
   }
  ]
 },
 {
  "name": "AIT Network",
  "slug": "ait-network",
  "existing": true,
  "type": "TV",
  "location": {
   "city": null,
   "state": null,
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Muse on AIT",
    "kind": "TIME_BELT",
    "startTime": "21:30",
    "endTime": "22:00",
    "spotSeconds": 15,
    "days": [
     4
    ],
    "price": 350000,
    "isActive": true
   },
   {
    "name": "News Hour",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [],
    "price": 450450,
    "isActive": true
   },
   {
    "name": "Family Ties",
    "kind": "TIME_BELT",
    "startTime": "19:30",
    "endTime": "20:00",
    "spotSeconds": 15,
    "days": [
     4
    ],
    "price": 490000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Channels Television",
  "slug": "channels-television",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "News @10pm",
    "kind": "TIME_BELT",
    "startTime": "22:00",
    "endTime": "23:00",
    "spotSeconds": 15,
    "days": [],
    "price": 394378,
    "isActive": true
   }
  ]
 },
 {
  "name": "Silverbird Television",
  "slug": "silverbird-television",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Music Africa",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "14:00",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 170000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Galaxy Television (Lagos And Ibadan)",
  "slug": "galaxy-television-lagos-and-ibadan",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Yoruba Movies",
    "kind": "TIME_BELT",
    "startTime": "08:30",
    "endTime": "09:00",
    "spotSeconds": 15,
    "days": [
     0
    ],
    "price": 60000,
    "isActive": true
   },
   {
    "name": "Yoruba Movies",
    "kind": "TIME_BELT",
    "startTime": "08:30",
    "endTime": "09:00",
    "spotSeconds": 15,
    "days": [
     1
    ],
    "price": 60000,
    "isActive": true
   },
   {
    "name": "Women's Corner",
    "kind": "TIME_BELT",
    "startTime": "12:00",
    "endTime": "12:30",
    "spotSeconds": 15,
    "days": [
     2
    ],
    "price": 60000,
    "isActive": true
   },
   {
    "name": "Overcoming H.B",
    "kind": "TIME_BELT",
    "startTime": "15:00",
    "endTime": "16:00",
    "spotSeconds": 15,
    "days": [
     2,
     3,
     4
    ],
    "price": 75000,
    "isActive": true
   }
  ]
 },
 {
  "name": "ONTV Lagos",
  "slug": "ontv-lagos",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Telenovela",
    "kind": "TIME_BELT",
    "startTime": "13:30",
    "endTime": "14:30",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 200250,
    "isActive": true
   },
   {
    "name": "Nollywood Movies",
    "kind": "TIME_BELT",
    "startTime": "14:30",
    "endTime": "15:30",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 200250,
    "isActive": true
   },
   {
    "name": "Yoruba Movies",
    "kind": "TIME_BELT",
    "startTime": "10:00",
    "endTime": "10:30",
    "spotSeconds": 15,
    "days": [
     6
    ],
    "price": 200250,
    "isActive": true
   },
   {
    "name": "Nollywood Movies",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "20:00",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 200250,
    "isActive": true
   }
  ]
 },
 {
  "name": "TVC",
  "slug": "tvc",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Lagos",
   "state": "Lagos",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Entertainment Splash",
    "kind": "TIME_BELT",
    "startTime": "12:30",
    "endTime": "13:00",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 100000,
    "isActive": true
   },
   {
    "name": "Your View",
    "kind": "TIME_BELT",
    "startTime": "09:00",
    "endTime": "11:00",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 125000,
    "isActive": true
   },
   {
    "name": "Backdoor",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     5
    ],
    "price": 170000,
    "isActive": true
   },
   {
    "name": "Cooking With Game Changer",
    "kind": "TIME_BELT",
    "startTime": "17:30",
    "endTime": "18:00",
    "spotSeconds": 15,
    "days": [
     0
    ],
    "price": 406250,
    "isActive": true
   }
  ]
 },
 {
  "name": "Rivers Television",
  "slug": "rivers-television",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Port Harcourt",
   "state": "Rivers",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Local News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "20:00",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 40000,
    "isActive": true
   },
   {
    "name": "Sands of Time",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [
     1
    ],
    "price": 75000,
    "isActive": true
   },
   {
    "name": "Face 2 Face",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [
     5
    ],
    "price": 89500,
    "isActive": true
   },
   {
    "name": "Behind the smile",
    "kind": "TIME_BELT",
    "startTime": "20:30",
    "endTime": "21:00",
    "spotSeconds": 15,
    "days": [
     3
    ],
    "price": 76873.5,
    "isActive": true
   },
   {
    "name": "Clinic Matters",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "18:30",
    "spotSeconds": 15,
    "days": [
     5
    ],
    "price": 129600,
    "isActive": true
   }
  ]
 },
 {
  "name": "Wazobia Max TV Port Harcourt",
  "slug": "wazobia-max-tv-port-harcourt",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Port Harcourt",
   "state": "Rivers",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Movie",
    "kind": "TIME_BELT",
    "startTime": "09:00",
    "endTime": "11:00",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 14700,
    "isActive": true
   },
   {
    "name": "Movies/ Pure PH Musicals",
    "kind": "TIME_BELT",
    "startTime": "15:00",
    "endTime": "16:00",
    "spotSeconds": 15,
    "days": [
     0,
     5,
     6
    ],
    "price": 29400,
    "isActive": true
   }
  ]
 },
 {
  "name": "EBS Channel 55 Benin",
  "slug": "ebs-channel-55-benin",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Benin City",
   "state": "Edo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "EBS Tonight",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 53750,
    "isActive": true
   },
   {
    "name": "Weekend News / Talk Shows",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     6
    ],
    "price": 53750,
    "isActive": true
   }
  ]
 },
 {
  "name": "Independent TV Benin",
  "slug": "independent-tv-benin",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Benin City",
   "state": "Edo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Crack in The Wall",
    "kind": "TIME_BELT",
    "startTime": "20:30",
    "endTime": "21:00",
    "spotSeconds": 15,
    "days": [
     1
    ],
    "price": 76873.5,
    "isActive": true
   },
   {
    "name": "Mid News",
    "kind": "TIME_BELT",
    "startTime": "19:30",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3
    ],
    "price": 102000,
    "isActive": true
   },
   {
    "name": "Circle of Interest",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "18:30",
    "spotSeconds": 15,
    "days": [
     3
    ],
    "price": 100000,
    "isActive": true
   },
   {
    "name": "Foodies & Spice",
    "kind": "TIME_BELT",
    "startTime": "17:30",
    "endTime": "18:00",
    "spotSeconds": 15,
    "days": [
     4
    ],
    "price": 120000,
    "isActive": true
   }
  ]
 },
 {
  "name": "NTA Benin",
  "slug": "nta-benin",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Benin City",
   "state": "Edo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Mid News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [],
    "price": 12000,
    "isActive": true
   }
  ]
 },
 {
  "name": "DBS Television Asaba",
  "slug": "dbs-television-asaba",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Asaba",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Beauty, Fashion & Style",
    "kind": "TIME_BELT",
    "startTime": "14:30",
    "endTime": "15:00",
    "spotSeconds": 15,
    "days": [
     2
    ],
    "price": 9100,
    "isActive": true
   },
   {
    "name": "Food Clinic",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [
     4
    ],
    "price": 55000,
    "isActive": true
   }
  ]
 },
 {
  "name": "DBS Television Warri",
  "slug": "dbs-television-warri",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Warri",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "DRTV Main News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [],
    "price": 18200,
    "isActive": true
   },
   {
    "name": "Morning Watch",
    "kind": "TIME_BELT",
    "startTime": "08:00",
    "endTime": "09:00",
    "spotSeconds": 15,
    "days": [],
    "price": 9100,
    "isActive": true
   }
  ]
 },
 {
  "name": "NTA Asaba",
  "slug": "nta-asaba",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Asaba",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Mid News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [],
    "price": 10000,
    "isActive": true
   }
  ]
 },
 {
  "name": "ABS TV Awka",
  "slug": "abs-tv-awka",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Awka",
   "state": "Anambra",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Movie (Igbo)",
    "kind": "TIME_BELT",
    "startTime": "12:30",
    "endTime": "13:00",
    "spotSeconds": 15,
    "days": [
     0
    ],
    "price": 8658,
    "isActive": true
   },
   {
    "name": "Akuko Uwa (Local News)",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 33475,
    "isActive": true
   },
   {
    "name": "So Wrong so Wright",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     1
    ],
    "price": 79296,
    "isActive": true
   }
  ]
 },
 {
  "name": "NTA Awka",
  "slug": "nta-awka",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Awka",
   "state": "Anambra",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Mid News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [],
    "price": 10000,
    "isActive": true
   }
  ]
 },
 {
  "name": "NTA Onitsha",
  "slug": "nta-onitsha",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Onitsha",
   "state": "Anambra",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Mid News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [],
    "price": 10000,
    "isActive": true
   }
  ]
 },
 {
  "name": "BCOS Ibadan",
  "slug": "bcos-ibadan",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Ibadan",
   "state": "Oyo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Insight With Agatha",
    "kind": "TIME_BELT",
    "startTime": "16:00",
    "endTime": "16:30",
    "spotSeconds": 15,
    "days": [
     2
    ],
    "price": 11812.5,
    "isActive": true
   },
   {
    "name": "World News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 17718.75,
    "isActive": true
   },
   {
    "name": "Blissful Home",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "18:30",
    "spotSeconds": 15,
    "days": [
     3,
     5
    ],
    "price": 75000,
    "isActive": true
   },
   {
    "name": "Crack in the Wall",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     0
    ],
    "price": 76873.5,
    "isActive": true
   }
  ]
 },
 {
  "name": "NTA Ibadan",
  "slug": "nta-ibadan",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Ibadan",
   "state": "Oyo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Mid News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [],
    "price": 24000,
    "isActive": true
   },
   {
    "name": "ROS",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "21:00",
    "spotSeconds": 15,
    "days": [],
    "price": 18000,
    "isActive": true
   }
  ]
 },
 {
  "name": "NTA Aba",
  "slug": "nta-aba",
  "existing": true,
  "type": "TV",
  "location": {
   "city": "Aba",
   "state": "Abia",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "News @ 7pm",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 12000,
    "isActive": true
   }
  ]
 },
 {
  "name": "IBC Owerri",
  "slug": "ibc-owerri",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Owerri",
   "state": "Imo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Sumptuous Fest",
    "kind": "TIME_BELT",
    "startTime": "18:00",
    "endTime": "18:30",
    "spotSeconds": 15,
    "days": [
     5
    ],
    "price": 155000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Oriental TV",
  "slug": "oriental-tv",
  "existing": false,
  "type": "TV",
  "location": {
   "city": "Owerri",
   "state": "Imo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Prime-Time Local News",
    "kind": "TIME_BELT",
    "startTime": "19:00",
    "endTime": "19:30",
    "spotSeconds": 15,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 17220,
    "isActive": true
   },
   {
    "name": "Family Platform",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     1
    ],
    "price": 124298,
    "isActive": true
   },
   {
    "name": "Igbo Drama Series",
    "kind": "TIME_BELT",
    "startTime": "20:00",
    "endTime": "20:30",
    "spotSeconds": 15,
    "days": [
     0
    ],
    "price": 10668,
    "isActive": true
   }
  ]
 },
 {
  "name": "Agidigbo 88.7 FM",
  "slug": "agidigbo-88-7-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Ibadan",
   "state": "Oyo",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 9840,
    "isActive": true
   }
  ]
 },
 {
  "name": "Rave FM",
  "slug": "rave-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Osogbo",
   "state": "Osun",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 20000,
    "isActive": true
   }
  ]
 },
 {
  "name": "DBS Radio Asaba",
  "slug": "dbs-radio-asaba",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Asaba",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 15000,
    "isActive": true
   }
  ]
 },
 {
  "name": "Quest FM",
  "slug": "quest-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Asaba",
   "state": "Delta",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 18500,
    "isActive": true
   }
  ]
 },
 {
  "name": "Dream 92.5 FM",
  "slug": "dream-92-5-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Enugu",
   "state": "Enugu",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 6500,
    "isActive": true
   }
  ]
 },
 {
  "name": "Correct FM",
  "slug": "correct-fm",
  "existing": false,
  "type": "RADIO",
  "location": {
   "city": "Enugu",
   "state": "Enugu",
   "country": "Nigeria"
  },
  "rateCard": [
   {
    "name": "Time check",
    "kind": "PLACEMENT",
    "spotSeconds": 5,
    "days": [
     1,
     2,
     3,
     4,
     5
    ],
    "price": 10000,
    "isActive": true
   }
  ]
 }
] };
