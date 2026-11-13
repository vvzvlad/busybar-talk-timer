# Talk Timer

A speaker timer: big minutes and seconds that turn from green to yellow to red as your time runs out.

A JavaScript app for [BUSY Bar](https://busy.app). Work in progress.

## What it does

- Turn the wheel to set the length in one-minute steps. Start starts and pauses, OK resets while paused.
- The front display shows the time left in large digits over a green, yellow or red band. Past zero it counts up in red.
- A sound and a blink of the status light mark yellow, red and zero.
- The back display repeats the time in large digits for the audience or the host behind you.
- Settings: default length, minutes left for yellow, minutes left for red, sound on or off.

## Data

None: it works offline.

## Build

Node 24 and npm:

```sh
npm ci
npm run build         # dist/io.github.vvzvlad.talktimer.tgz
npm run app:install   # install it on a BUSY Bar connected over USB
npm run app:run       # start it
```

## License

[MIT](LICENSE)
