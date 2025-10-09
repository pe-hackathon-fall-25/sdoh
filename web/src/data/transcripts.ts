export type TranscriptMessage = {
  speaker: string;
  text: string;
  language?: string;
  timestamp?: string;
};

export type TranscriptSample = {
  id: string;
  title: string;
  summary: string;
  transcript: TranscriptMessage[];
};

export const transcriptSamples: TranscriptSample[] = [
  {
    id: 'alex-rivera',
    title: 'Alex Rivera | Food + Utilities',
    summary: 'Bilingual outreach call covering food access, SNAP renewal, and power shutoff risk.',
    transcript: [
      {
        speaker: 'navigator',
        text: 'Hola Alex, thanks for picking up. We are checking in about groceries and your SNAP renewal.',
        language: 'es',
        timestamp: '2025-01-17T15:03:00Z',
      },
      {
        speaker: 'member',
        text: 'Yeah it has been rough. The food bank is the only place I eat lately and sometimes they close early.',
        language: 'en',
        timestamp: '2025-01-17T15:03:27Z',
      },
      {
        speaker: 'member',
        text: 'Mi nevera está vacía casi siempre y me salto comidas.',
        language: 'es',
        timestamp: '2025-01-17T15:03:48Z',
      },
      {
        speaker: 'navigator',
        text: 'We can escalate the emergency pantry delivery. Did the utility company restore your electricity yet?',
        language: 'en',
        timestamp: '2025-01-17T15:04:03Z',
      },
      {
        speaker: 'member',
        text: 'No, my electricity got shut off on Tuesday and they said it might take a week unless I pay everything.',
        language: 'en',
        timestamp: '2025-01-17T15:04:18Z',
      },
      {
        speaker: 'member',
        text: 'Estoy durmiendo en mi coche por las noches para mantenerme caliente.',
        language: 'es',
        timestamp: '2025-01-17T15:04:39Z',
      },
      {
        speaker: 'navigator',
        text: 'That is not safe. We will activate utility relief and emergency housing supports right now.',
        language: 'en',
        timestamp: '2025-01-17T15:04:55Z',
      },
    ],
  },
  {
    id: 'maria-lopez',
    title: 'María López | Transportation + Meds',
    summary: 'SMS follow-up about transportation barriers and medication affordability.',
    transcript: [
      {
        speaker: 'member',
        text: 'My landlord is evicting me next month so I am packing up.',
        language: 'en',
        timestamp: '2025-01-12T19:12:45Z',
      },
      {
        speaker: 'member',
        text: 'No tengo coche ahora, el motor murió y no tengo transporte para llegar a la clínica.',
        language: 'es',
        timestamp: '2025-01-12T19:13:10Z',
      },
      {
        speaker: 'member',
        text: "I can't afford my medications until next paycheck. Maybe in two weeks.",
        language: 'en',
        timestamp: '2025-01-12T19:13:54Z',
      },
      {
        speaker: 'nurse',
        text: 'Thanks María, logging this for the care team. We will set up mail-order meds and a Lyft voucher.',
        language: 'en',
        timestamp: '2025-01-12T19:14:11Z',
      },
    ],
  },
];
