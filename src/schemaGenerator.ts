import { promises as fs } from 'fs';
import path from 'path';
import type { Logger } from 'homebridge';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings';

export interface DirectoryPeerOption {
  name: string;
  peer: string;
}

interface SchemaGeneratorOptions {
  baseSchemaPath: string;
  storagePath: string;
  peers: DirectoryPeerOption[];
  log: Logger;
}

const FALLBACK_OPTION = {
  title: 'All callers (default)',
  enum: [''],
  description: 'Respond to any button press from the intercom.'
};

export async function writeDynamicSchema({
  baseSchemaPath,
  storagePath,
  peers,
  log,
}: SchemaGeneratorOptions): Promise<void> {
  try {
    const schemaFile = await fs.readFile(baseSchemaPath, 'utf8');
    const schema = JSON.parse(schemaFile);
    const targetFiles = buildTargetPaths(storagePath, schema);

    const peerProperty = schema?.schema?.properties?.doorbellFilterPeer;
    if (!peerProperty) {
      log.warn('⚠️  Unable to locate doorbellFilterPeer property in base schema. Skipping dynamic schema generation.');
      return;
    }

    if (!Array.isArray(peers) || peers.length === 0) {
      await Promise.all(targetFiles.map(file => removeDynamicSchema(file, log)));
      log.warn('⚠️  Directory list was empty, removed dynamic schema so Config UI falls back to text input.');
      return;
    }

    const peerOptions = peers.map(peer => ({
      title: `${peer.peer.split('/')?.[0] || peer.peer} (${peer.name})`,
      enum: [peer.peer],
    }));

    peerProperty.oneOf = [FALLBACK_OPTION, ...peerOptions];
    peerProperty.enum = [''].concat(peerOptions.map(option => option.enum[0]));
    peerProperty.description = 'Select which discovered phone number should trigger doorbell notifications, or choose "All callers".';
    peerProperty.placeholder = 'Pick from the list';
    peerProperty.default = peerProperty.default ?? '';

    await Promise.all(targetFiles.map(file => writeSchemaFile(file, schema, log)));
    log.info(`📝 Dynamic config schema updated with ${peers.length} directory peer option(s)`);
  } catch (error: any) {
    log.error('❌ Failed to write dynamic config schema:', error?.message || error);
  }
}

async function writeSchemaFile(schemaPath: string, schema: any, log: Logger): Promise<void> {
  try {
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2), 'utf8');
    log.debug(`💾 Wrote dynamic schema to ${schemaPath}`);
  } catch (error: any) {
    log.warn(`⚠️  Unable to write dynamic schema file ${schemaPath}:`, error?.message || error);
  }
}

function buildTargetPaths(storagePath: string, schema: any): string[] {
  const version = schema?.dynamicSchemaVersion ?? 1;

  const baseNames = [
    `.${PLUGIN_NAME}.schema.json`,
    `.${PLATFORM_NAME}.schema.json`,
  ];

  const versionedNames = baseNames.map(name => name.replace('.schema.json', `-v${version}.schema.json`));

  const allNames = [...baseNames, ...versionedNames];

  const uniquePaths = Array.from(new Set(allNames.map(name => path.join(storagePath, name))));

  return uniquePaths;
}

async function removeDynamicSchema(schemaPath: string, log: Logger): Promise<void> {
  try {
    await fs.unlink(schemaPath);
    log.debug(`🗑️  Removed stale dynamic schema at ${schemaPath}`);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      log.warn('⚠️  Could not remove dynamic schema file:', error?.message || error);
    }
  }
}
