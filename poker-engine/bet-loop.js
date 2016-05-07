
'use strict';

// const winston = require('winston');
// const gamestory = winston.loggers.get('gamestory');
// const errors = winston.loggers.get('errors');

const save = require('../storage/storage').save;
const run = require('../utils/generator-runner');

const status = require('./domain/player-status');
const session = require('./domain/game-session');
// const takeBets = require('./domain-utils/collect-player-bets');


function isBetRoundFinished(gs){

  let allin = Symbol.for('is-all-in');
  let activePlayers = gs.players.filter(p => p.status === status.active);

  if (activePlayers.length == 1){
    return true;
  }

  return activePlayers.filter(p => p.chipsBet < gs.callAmount && !p[allin]).length == 0;

}


function* handLoop(gs){

  const active = status.active;
  const hasBB = Symbol.for('has-big-blind');
  const hasDB = Symbol.for('has-dealer-button');

  const tag = { id: gs.handId, type: 'session' };
  const cardTag = { id: gs.handId, type: 'cards' };

  let activePlayers = gs.players.filter(p => p.status === active);

  //
  // the hand continues until
  // all the community cards are shown
  // and there are more than an active player
  while (gs.commonCards.length <= 5 && activePlayers.length > 1){

    //
    // preflop session
    if (gs.commonCards.length == 0){

      gs.session = session.pre;

      // gamestory.info('The %s betting session is starting.', gs.session, tag);

      // count the number of time
      // that players had already have the possibility to bet in the current session.
      // it is reset every time a new session (flop, turn, or river) begins.
      gs.spinCount = 0;

      // check if there are active players
      // who still have to call, or fold
      while (!isBetRoundFinished(gs)){

        // https://bot-poker.herokuapp.com/tournament/571905c192d57e0300e822cc/watch/112/11

        let bbIndex = gs.players.findIndex(player => player[hasBB]);
        yield takeBets(gs, bbIndex);
        gs.spinCount++;
      }

      //
      // all the players have defined their bet;
      // if only one is still active, he will be the winner of the hand,
      // otherwise game goes on with the flop session.

      activePlayers = gs.players.filter(p => p.status === active);

      if (activePlayers.length > 1){

        // gamestory.info('There are still %d active players after the %s betting session.', activePlayers.length, gs.session, tag);

        //
        // since there are still more than one "active" player
        // we have to continue with the flop session.
        // add three cards on the table
        gs.commonCards.push(gs.deck.shift(), gs.deck.shift(), gs.deck.shift());

        // gamestory.info('Flop cards are: %s', JSON.stringify(gs.commonCards), cardTag);

        gs.session = session.flop;
        yield save(gs, { type: 'cards', handId: gs.handId, session: gs.session, commonCards: gs.commonCards });
      }
      else {
        //
        // ... otherwise, we stop the loop immediately
        // returning the control on the runner
        // gamestory.info('Only one player after the %s betting session.', gs.session, tag);
        return gs;
      }

    }
    else {

      gs.session = gs.commonCards.length == 3 ? session.flop : (gs.commonCards.length == 4 ? session.turn : session.river);

      // gamestory.info('The %s betting session is starting.', gs.session, tag);

      gs.spinCount = 0;

      do {
        let dbIndex = gs.players.findIndex(player => player[hasDB]);
        yield takeBets(gs, dbIndex);
        gs.spinCount++;
      } while(!isBetRoundFinished(gs));

      //
      // all the players have defined their bet;
      // if only one is still active, he will be the winner of the hand,
      // otherwise game goes on with the turn/river session.

      activePlayers = gs.players.filter(p => p.status === status.active);

      if (activePlayers.length > 1 && gs.commonCards.length < 5) {

        // gamestory.info('There are still %d active players after the %s betting session.', activePlayers.length, gs.session, tag);

        //
        // until there are more than one "active" player, and the game
        // has not reached the river session, we coninue to run the loop.
        // add another card on the table
        const newCard = gs.deck.shift();
        gs.commonCards.push(newCard);

        gs.session = gs.commonCards.length == 4 ? session.turn : session.river;

        // gamestory.info('%s card is: %s', gs.session, JSON.stringify(newCard), cardTag);

        yield save(gs, { type: 'cards', handId: gs.handId, session: gs.session, commonCards: [newCard] });
      }
      else {
        //
        // ... otherwise, we stop the loop immediately
        // returning the control on the runner
        if (activePlayers.length == 1){
          // gamestory.info('Only one player after the %s betting session.', gs.session, tag);
        }
        return gs;
      }

    }

  }

  return gs;

}