// Story scripts. Each returns an array of dialogue lines.
// shot: camera preset in the pub; who: speaker (null = narration)

export const STORY = {
  intro: (c) => [
    { place: 'Ashcroft, Greater Manchester', text: 'Wednesday night. Raining, obviously. The King\'s Head has stood on Mill Lane since 1868 — through two wars, three recessions and the smoking ban.', shot: 'wide' },
    { text: `You've pulled pints here for six years. You know every regular, every round, and every story Terry Kidd tells twice a night.`, shot: 'player' },
    { who: 'Maggie', text: `${c.player.name}, love, change the barrel on the bitter before Gaz Pickering starts crying into his pork scratchings.`, shot: 'maggie' },
    { who: 'Gaz', text: 'Oi. OI. This pint\'s flat. Like your face.', shot: 'gaz' },
    { who: 'Maggie', text: 'Gary. You\'ve had nine. Go home to your mother.', shot: 'maggie' },
    { who: 'Gaz', text: 'Make me.', shot: 'gaz' },
    {
      who: c.player.name, text: '…', shot: 'player', choices: [
        { t: '“Gaz, mate. Go home.”', then: [{ who: 'Gaz', text: 'Nah. You. Come on then, bar boy. Round this side.', shot: 'gaz' }] },
        { t: '“Right. Outside. Well — in here, actually.”', then: [{ who: 'Gaz', text: 'HA! Go on then! Somebody hold me pint!', shot: 'gaz' }] },
      ]
    },
    { text: 'The jukebox skips. Twenty regulars turn round on their stools. Somebody moves a table.', shot: 'wide' },
  ],

  postTutorial: (c, won) => [
    { text: won ? 'Gaz is asleep on the carpet. The jukebox is still playing Oasis. Somebody starts a slow clap.' : 'Terry hauls Gaz off you by the collar and dumps him in the rain. But the whole pub saw it — you gave as good as you got.', shot: 'wide' },
    { who: 'Terry', text: 'Well, well. Where\'d you learn to throw a right hand like that, son?', shot: 'terry' },
    {
      who: c.player.name, text: '…', shot: 'player', choices: [
        { t: '“Breaking up fights in here, Tel.”', then: [{ who: 'Terry', text: 'Ha! Six years of chucking out time. Best school there is.', shot: 'terry' }] },
        { t: '“My dad. Before he left.”', then: [{ who: 'Terry', text: 'Then he taught you one useful thing. More than mine did.', shot: 'terry' }] },
      ]
    },
    { who: 'Terry', text: 'I was the best bare-knuckle man in the North West in \'94. Ask anyone. Ask Vince Doyle — he\'s still got the scar.', shot: 'terry' },
    { who: 'Maggie', text: `${c.player.name}… can I have a word? It's the brewery. We're six grand behind. They want it by the end of next season or they sell the lease.`, shot: 'maggie' },
    { who: 'Maggie', text: 'And guess who\'s offered to buy it. Ronnie bloody Vance. Wants to knock it down for flats.', shot: 'maggie' },
    { who: 'Terry', text: 'Vance runs the fights round here. All of \'em. There\'s a league in the cellar, Fridays. Eight lads, seven fights. Three points a win, bonus point for a knockout. Like the footy, but with teeth.', shot: 'terry' },
    { who: 'Terry', text: 'Top two fight for the belt. Finish top two and you go up to his Northern Circuit. Real money. And at the very top — the National. Doyle\'s the champion.', shot: 'terry' },
    { who: 'Terry', text: 'I\'ll train you. Back room, every morning. You\'ll hate me.', shot: 'terry' },
    {
      who: c.player.name, text: '…', shot: 'player', choices: [
        { t: `“Six grand's a lot of pints. I'm in.”` },
        { t: `“Nobody's knocking this place down.”` },
      ]
    },
    { who: 'Maggie', text: 'You daft sod. Don\'t you dare get your teeth knocked out. You\'ve got the best smile on Mill Lane.', shot: 'maggie' },
    { place: 'Season One', text: 'THE CELLAR LEAGUE. Each week: three slots for training, bar shifts or rest — then fight night. Every quid you earn can go toward the pub\'s debt.', shot: 'wide' },
  ],

  vanceVisit: (c) => [
    { text: 'A black Range Rover idles outside on the double yellows. The door goes. Everybody suddenly finds their pint very interesting.', shot: 'wide' },
    { who: 'Ronnie Vance', text: 'So you\'re the barman everybody\'s on about. Ronnie Vance. I own the league you\'re fighting in. Soon I\'ll own this pub as well.', shot: 'vance' },
    { who: 'Maggie', text: 'Over my dead body, Ronnie.', shot: 'maggie' },
    { who: 'Ronnie Vance', text: 'That can be arranged, Margaret. Joking. Mostly.', shot: 'vance' },
    {
      who: 'Ronnie Vance', text: 'Enjoy the Cellar, kid. It\'s the shallow end.', shot: 'vance', choices: [
        { t: '“See you at the top, Ronnie.”', id: 'bold', fx: () => { c.player.rep += 6; }, then: [{ who: 'Ronnie Vance', text: 'I like him. I\'ll like him less with a broken nose.', shot: 'vance' }] },
        { t: '“Get out of my pub.”', id: 'hostile', fx: () => { c.player.rep += 3; c.flags.vanceHates = true; }, then: [{ who: 'Ronnie Vance', text: 'Your pub? Read the letter, son.', shot: 'vance' }] },
        { t: 'Say nothing. Keep polishing the glass.', id: 'quiet', then: [{ who: 'Terry', text: 'Good lad. Never let him see anything.', shot: 'terry' }] },
      ]
    },
  ],

  finalMade: (c) => [
    { who: 'Terry', text: `Top two! You're in the final, ${c.player.name}. Win it and they put your name on the board downstairs. Forever. Or till they paint over it.`, shot: 'terry' },
  ],
  finalMissed: (c) => [
    { who: 'Terry', text: 'Not good enough, son. Not this time. We go again next season — same division, same smell, same me.', shot: 'terry' },
    { who: 'Maggie', text: 'The brewery won\'t wait forever, love. But I will.', shot: 'maggie' },
  ],

  promoted: (c, wonFinal) => {
    const div = c.div; // the NEW division
    if (div === 1) return [
      { who: 'Terry', text: wonFinal ? 'CHAMPION OF THE CELLAR! Look at him, Maggie! Look at the state of him!' : 'Lost the final, but runners-up go up an\' all. You\'re out of the cellar, son.', shot: 'terry' },
      { who: 'Ronnie Vance', text: '(on the phone) Congratulations. The Northern Circuit starts in a fortnight. Hartley\'s Mill. Bring your own towel.', shot: 'player' },
      { place: 'Season ' + c.season, text: 'THE NORTHERN CIRCUIT. Bigger lads, bigger purses, four rounds. Vance\'s territory.', shot: 'wide' },
    ];
    if (div === 2) return [
      { who: 'Terry', text: 'The National. The Corn Exchange. I never got there, son. You have.', shot: 'terry' },
      { who: 'Maggie', text: 'I\'ve had the posters printed. "The Barman." Kerry did the design. It\'s… it\'s a bit much.', shot: 'maggie' },
      { place: 'Season ' + c.season, text: 'THE NATIONAL CHAMPIONSHIP. Five rounds. The best in Britain. Finish top two to fight for the title — and Vince Doyle will be waiting.', shot: 'wide' },
    ];
    return [];
  },

  mill: (c) => [
    { who: 'Terry', text: 'Hartley\'s Mill. These lads fight for rent money and they don\'t lose politely. Hands up, chin down.', shot: 'terry' },
  ],

  bribe: (c) => [
    { text: 'Closing time. Vance\'s driver, a slab of a man called Mick, leaves an envelope on the bar and doesn\'t order anything.', shot: 'wide' },
    { who: 'Ronnie Vance', text: '(on Mick\'s phone, on speaker) Next week. Go down. Three grand in there. Your brewery problem gets a lot smaller. Nobody gets hurt. Well — you do, a bit.', shot: 'vance' },
    {
      who: c.player.name, text: 'The envelope is thick. Maggie is in the back doing the accounts with a calculator and a glass of sherry.', shot: 'player', choices: [
        { t: 'Take the envelope. (+£3,000)', id: 'take', fx: () => { c.player.money += 3000; c.player.rep -= 15; c.flags.bribe = true; }, then: [{ who: 'Ronnie Vance', text: 'Sensible lad. Next week, then. Make it look good.', shot: 'vance' }, { text: 'You put it in the drawer under the till. It feels heavier than three grand.', shot: 'player' }] },
        { t: 'Slide it back. “Tell Ronnie to stick it.”', id: 'refuse', fx: () => { c.player.rep += 12; c.flags.refused = true; }, then: [{ who: 'Ronnie Vance', text: 'Your funeral. Literally, if you\'re not careful.', shot: 'vance' }, { who: 'Terry', text: '(from the end of the bar) …I didn\'t hear that. But I\'m proud of you.', shot: 'terry' }] },
      ]
    },
  ],
  bribeAftermath: (c, won) => won ? [
    { who: 'Ronnie Vance', text: 'You took my money and you won anyway. That\'s not a business arrangement, son. That\'s a declaration of war.', shot: 'vance' },
    { who: 'Terry', text: 'Well. Now you\'ve done it. Better keep winning.', shot: 'terry' },
  ] : [
    { who: 'Terry', text: 'I watched that. You went down like a sack of spuds. Don\'t tell me. I don\'t want to know.', shot: 'terry' },
  ],

  doyle: (c) => [
    { text: 'Vince Doyle walks into the King\'s Head on a Tuesday, alone, and orders a lemonade.', shot: 'wide' },
    { who: 'Vince Doyle', text: 'Terry Kidd\'s new pet. He tell you about \'94? He tell you he quit?', shot: 'vance' },
    { who: 'Terry', text: 'I didn\'t quit, Vince. My hand broke on your head.', shot: 'terry' },
    { who: 'Vince Doyle', text: 'Twice. See you at the Corn Exchange, barman. I\'ll be the one with the belt.', shot: 'vance' },
  ],

  heart: (c) => [
    { who: 'Maggie', text: 'Can\'t sleep. Thirty-one years I\'ve had this place. Ron — my Ron — he carried me over that step.', shot: 'maggie' },
    {
      who: 'Maggie', text: 'Whatever happens with the brewery… you\'ve already given me more than you know.', shot: 'maggie', choices: [
        { t: `“I'm going to win it, Mags. All of it.”`, fx: () => { c.player.rep += 3; } },
        { t: `“Get some sleep. I'll lock up.”` },
      ]
    },
  ],

  titlePre: (c) => [
    { who: 'Terry', text: 'Listen to me. He\'s a counter-puncher. He wants you to come to him. So you don\'t. Jab. Make him lead. Then go to the body till his legs go.', shot: 'terry' },
    { who: 'Terry', text: 'And son? Whatever happens — you\'re the best thing that\'s walked into that pub in thirty years. Bar me.', shot: 'terry' },
  ],

  endingWin: (c) => [
    { text: 'The Corn Exchange is on its feet. Somewhere in the noise Maggie is crying and Terry is pretending he isn\'t.', shot: 'wide' },
    { who: 'Terry', text: 'CHAMPION! Champion of Britain! From behind the bar of the King\'s Head! I TOLD you! I told ALL of you!', shot: 'terry' },
    { who: 'Maggie', text: c.debt <= 0 ? 'The brewery\'s been paid. Every penny. The King\'s Head stays. It stays, love.' : 'With that purse… the brewery\'s paid. The King\'s Head stays. It STAYS.', shot: 'maggie' },
    { who: 'Ronnie Vance', text: 'Well played. Genuinely. Next year I\'ll find someone to take it off you.', shot: 'vance' },
    { place: 'The End… for now', text: 'They hang the belt behind the bar, next to the dartboard. You still pull pints on Wednesdays. Your career continues as the defending champion.', shot: 'wide' },
  ],
  endingLose: (c) => [
    { who: 'Terry', text: 'You took him the distance of hell, son. Nobody\'s ever made Doyle look like that.', shot: 'terry' },
    { who: 'Maggie', text: 'We go again. That\'s what this pub\'s always done.', shot: 'maggie' },
  ],
  debtWarning: (c) => [
    { who: 'Maggie', text: `The brewery rang. We still owe £${c.debt.toLocaleString()}. They've given us one more year — with interest. Last chance, they said.`, shot: 'maggie' },
  ],
  debtPaid: (c) => [
    { who: 'Maggie', text: 'I just rang the brewery. We\'re square. We\'re SQUARE! Drinks on the house! …Not you, Gaz.', shot: 'maggie' },
  ],
};

// Random bar-shift events
export const SHIFT_EVENTS = [
  (c, rnd) => ({
    lines: [{ text: 'A stag party from Wigan wants a lock-in. The groom is dressed as a Teletubby.', shot: 'wide', choices: [
      { t: 'Lock the doors. (+£60, +8 fatigue)', fx: () => { c.player.money += 60; c.player.fatigue += 8; } },
      { t: 'Last orders means last orders. (+2 rep)', fx: () => { c.player.rep += 2; } },
    ] }],
  }),
  (c, rnd) => ({
    lines: [{ who: 'Old Albert', text: 'Can you put it on the slate, lad? Pension\'s not in till Thursday.', shot: 'terry', choices: [
      { t: 'Of course, Albert. (+3 rep)', fx: () => { c.player.rep += 3; } },
      { t: 'Slate\'s full, Albert. (+£12)', fx: () => { c.player.money += 12; } },
    ] }],
  }),
  (c, rnd) => {
    const win = rnd() < 0.3 + c.player.stats.power / 150;
    return {
      lines: [{ who: 'Big Lad', text: 'Twenty quid says you can\'t beat me at arm wrestling, champ.', shot: 'player', choices: [
        { t: 'You\'re on.', fx: () => { c.player.money += win ? 20 : -20; }, then: [{ text: win ? 'His arm hits the bar like a dropped kebab. +£20.' : 'He nearly takes your arm off. -£20. Terry is laughing so hard he has to sit down.', shot: 'wide' }] },
        { t: 'Not tonight, mate.' },
      ] }],
    };
  },
  (c, rnd) => ({
    lines: [{ who: 'Maggie', text: 'Karaoke night and nobody\'s up. Go on. Do “Wonderwall”. For me.', shot: 'maggie', choices: [
      { t: 'Sing. Badly. (+4 rep)', fx: () => { c.player.rep += 4; }, then: [{ text: 'It is genuinely awful. The pub loves it.', shot: 'wide' }] },
      { t: 'Absolutely not.' },
    ] }],
  }),
  (c, rnd) => ({
    lines: [{ text: 'Quiet one. You restock the fridges, re-line the bins and listen to Terry explain the 1994 fight again. It ends differently this time.', shot: 'terry' }],
  }),
  (c, rnd) => ({
    lines: [{ text: 'A coachload of away fans pours in after the match. You don\'t stop pulling for four hours. Tips jar is overflowing. (+£45)', shot: 'wide', run: () => { } }],
    fx: () => { c.player.money += 45; },
  }),
];
