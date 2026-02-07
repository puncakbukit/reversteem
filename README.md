# Reversteem - Reversi on Steem

A minimal, fully client-side Reversi game built on top of the Steem blockchain.

This project demonstrates how turn-based games can be implemented on Steem
using posts and replies as an immutable game log, without smart contracts.

## Features

- 100% static frontend (GitHub Pages compatible)
- No backend or server required
- Uses Steem posts and replies as game state
- Open-source and forkable

## How it works

- A Steem post represents a game
- Replies represent moves
- The frontend reconstructs the board deterministically
- Rules are enforced client-side

## Running locally

Just open `index.html` in a browser.

## Deployment

This project can be deployed for free using GitHub Pages.

## License

MIT
