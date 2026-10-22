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

/**
 * Software identity, distinct from the operator-configurable site title
 * (config.json "title"). Shown in the footer only. The version is the
 * source commit hash, injected at build time (vite.config.ts define).
 */

export const SOFTWARE = "PonEE Fauxl (Apache Pony Mail)";

/** Short commit hash of the site source at build time. */
export const VERSION: string = __PONYMAIL_VERSION__;

/** Footer string, e.g. "Pony Mail Fauxl v/9c3b166". */
export const SOFTWARE_VERSION = `${SOFTWARE} v/${VERSION}`;
