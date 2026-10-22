/*
 Licensed to the Apache Software Foundation (ASF) under one or more
 contributor license agreements.  See the NOTICE file distributed with
 this work for additional information regarding copyright ownership.
 The ASF licenses this file to You under the Apache License, Version 2.0
 (the "License"); you may not use this file except in compliance with
 the License.  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
import { mount } from "svelte";
import "./app.css";
import { config, loadConfig } from "./lib/config";

// Config first, app second: modules read config values when they
// initialize (pref defaults) and when they run (API base, titles), so
// config.json must be resolved before the app module graph loads,
// hence the dynamic import.
await loadConfig();

// The favicon follows the configured logo (index.html ships the
// default; a config.json override retargets it here).
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (icon && config.logo) icon.href = config.logo;

const { default: App } = await import("./App.svelte");

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
