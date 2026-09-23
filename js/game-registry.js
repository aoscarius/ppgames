/* Shared game registry. Each future game plugs into the same room/P2P lifecycle. */
const GAME_REGISTRY = {
    poker:  {id:'poker',  name:'Poker',        implemented:true,  minPlayers:2, maxPlayers:8},
    chess:  {id:'chess',  name:'Chess',        implemented:false, minPlayers:2, maxPlayers:2},
    othello:{id:'othello',name:'Othello',      implemented:false, minPlayers:2, maxPlayers:2},
    naval:  {id:'naval',  name:'Naval Battle', implemented:false, minPlayers:2, maxPlayers:2}
};
function getGameDefinition(id){ return GAME_REGISTRY[id] || GAME_REGISTRY.poker; }
