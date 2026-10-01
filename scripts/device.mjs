#!/usr/bin/env node
// device-control raw backend CLI: list, boot, install, launch, open, screenshot, logs on Android emulators and iOS simulators.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, handleHelp } from './lib/args.mjs';
import { printJson, setJsonMode, die, log } from './lib/log.mjs';
import * as dev from './lib/devices.mjs';

const HELP = `
Usage: node device.mjs <command> [--platform android|ios] [--target <serial|udid>] [options]

Commands:
  list                         Running Android devices, AVDs, and iOS simulators (with state)
  boot <avd | iOS device type> Android: start the AVD and wait until booted (--headless for no window)
                               iOS: find or create "QA <name>" for that device type and boot it
  install <path>               Install an .apk (Android) or .app (iOS)
  launch <appId>               Launch an app by package / bundle id
  stop <appId>                 Force-stop / terminate an app
  open <url> [--app <appId>]   Open a deep link (Android: --app pins the intent to the app)
  screenshot <file.png>        Save a screenshot
  record <file.mp4|file.mov> [--seconds 10]   (iOS writes QuickTime: use .mov)
                               Record the screen (H.264). Android max 180 s. Use a release build to judge motion
  logs [--app <appId>] [--level verbose|debug|info|warn|error] [--lines 100] [--since 5m]
                               Recent log lines (snapshot). Android: filtered by the app's pid.
                               iOS: "log show" for the app's executable.

Options:
  --platform <p>   android (default) or ios
  --target <id>    adb serial or simulator udid (default: first emulator / booted simulator)
  --headless       boot: start the emulator without a window
  --json           Machine-readable output on stdout
  --help           Show this help

iOS commands need macOS with Xcode. Never leave a device modified: restore font scale,
display size, dark mode and locale after changing them.
`;

function target(args) {
  if (args.target) return args.target;
  if (args.platform === 'ios') {
    dev.requireXcrun();
    return dev.bootedSim() ?? die('No booted iOS simulator. Boot one: node device.mjs boot "iPhone 17" --platform ios');
  }
  return dev.androidSerial();
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    boolean: ['json', 'headless', 'help'],
    string: ['platform', 'target', 'app', 'level', 'lines', 'since', 'seconds'],
    alias: { h: 'help' },
  });
  handleHelp(args, HELP);
  setJsonMode(args.json);
  args.platform ||= 'android';
  if (!['android', 'ios'].includes(args.platform)) die(`--platform must be android or ios`);
  const [cmd, arg] = args._;
  const out = (obj, text) => (args.json ? printJson(obj) : log.ok(text));

  switch (cmd) {
    case 'list': {
      const res = { android: { devices: [], avds: [] }, ios: { simulators: [] } };
      try { res.android.devices = dev.listAndroid(); } catch (e) { res.android.error = e.message; }
      try { res.android.avds = dev.listAvds(); } catch (e) { res.android.avdError = e.message; }
      if (process.platform === 'darwin') {
        try { res.ios.simulators = dev.listIosSims().filter((s) => s.isAvailable !== false).map(({ name, udid, state, runtime }) => ({ name, udid, state, runtime: runtime.split('.').pop() })); }
        catch (e) { res.ios.error = e.message; }
      } else res.ios.error = 'iOS needs macOS + Xcode';
      if (args.json) return printJson(res);
      log.info(`Android running: ${res.android.devices.join(', ') || res.android.error || 'none'}`);
      log.info(`Android AVDs:    ${res.android.avds.join(', ') || res.android.avdError || 'none'}`);
      log.info(`iOS booted:      ${res.ios.simulators.filter((s) => s.state === 'Booted').map((s) => `${s.name} (${s.udid})`).join(', ') || res.ios.error || 'none'}`);
      return;
    }
    case 'boot': {
      if (!arg) die('boot needs an AVD name (Android) or a device type such as "iPhone 17" (iOS)');
      if (args.platform === 'ios') {
        dev.requireXcrun();
        const udid = dev.ensureSim([arg], { name: arg }) ?? die(`No simulator could be created for "${arg}"`);
        await dev.bootSim(udid);
        return out({ platform: 'ios', target: udid }, `Booted QA ${arg} (${udid})`);
      }
      const serial = await dev.bootAvd(arg, { headless: args.headless });
      await dev.waitForBoot(serial);
      return out({ platform: 'android', target: serial }, `Booted ${arg} as ${serial}`);
    }
    case 'install': {
      if (!arg) die('install needs a path to an .apk or .app');
      const t = target(args);
      dev.install(args.platform, t, path.resolve(arg));
      return out({ platform: args.platform, target: t, installed: path.resolve(arg) }, `Installed ${arg} on ${t}`);
    }
    case 'launch':
    case 'stop': {
      if (!arg) die(`${cmd} needs an app id`);
      const t = target(args);
      (cmd === 'launch' ? dev.launch : dev.terminate)(args.platform, t, arg);
      return out({ platform: args.platform, target: t, [cmd === 'launch' ? 'launched' : 'stopped']: arg }, `${cmd === 'launch' ? 'Launched' : 'Stopped'} ${arg} on ${t}`);
    }
    case 'open': {
      if (!arg) die('open needs a URL, e.g. myapp://settings');
      const t = target(args);
      dev.openUrl(args.platform, t, arg, args.app);
      return out({ platform: args.platform, target: t, opened: arg }, `Opened ${arg} on ${t}`);
    }
    case 'screenshot': {
      if (!arg) die('screenshot needs an output file');
      const t = target(args);
      const file = path.resolve(arg);
      dev.screenshot(args.platform, t, file);
      return out({ platform: args.platform, target: t, file }, file);
    }
    case 'record': {
      if (!arg) die('record needs an output file, e.g. motion.mp4');
      const seconds = Number(args.seconds ?? 10);
      if (!(seconds > 0)) die('--seconds must be a positive number');
      const t = target(args);
      const file = path.resolve(arg);
      if (!args.json) log.step(`Recording ${seconds}s on ${t}…`);
      await dev.record(args.platform, t, file, { seconds });
      return out({ platform: args.platform, target: t, file, seconds }, file);
    }
    case 'logs': {
      const t = target(args);
      const text = dev.logs(args.platform, t, { appId: args.app, level: args.level, lines: Number(args.lines ?? 100), since: args.since });
      if (args.json) return printJson({ platform: args.platform, target: t, lines: text ? text.split('\n') : [] });
      process.stdout.write(text + '\n');
      return;
    }
    default:
      process.stdout.write(HELP.trim() + '\n');
      process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => die(e.stderr?.toString().trim() || e.message));
