const { execSync, execFileSync, spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fsPromises = fs.promises;
const { randomUUID } = require('crypto');
const { FileUtils } = require('./fileUtils');

function uuidv4() {
  return randomUUID();
}

/**
 * Simple store using JSON files (replacement for electron-store)
 */
class SimpleStore {
  constructor(name = 'config.json') {
    this.storagePath = path.join(os.homedir(), '.convertisseur-vm');
    this.filePath = path.join(this.storagePath, name);
    this.data = {};
    this.ensureDirSync();
    this.loadSync();
  }

  ensureDirSync() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  loadSync() {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content);
      } else {
        this.data = {};
        this.saveSync();
      }
    } catch (error) {
      console.error('Error loading store:', error);
      this.data = {};
    }
  }

  saveSync() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving store:', error);
    }
  }

  get(key, defaultValue = null) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue;
  }

  set(key, value) {
    this.data[key] = value;
    this.saveSync();
  }
}

const store = new SimpleStore('converter-history.json');

class Converter {
  constructor() {
    this.conversions = [];
    this.loadHistory();
    this.qemuMode = 'native';
    this.wslExePath = null;
    this.qemuImgPath = this.getQemuImgPath();
  }

  /**
   * Trouver l'exécutable WSL côté Windows
   */
  static getWslExecutablePath() {
    if (process.platform !== 'win32') return null;

    const candidates = [
      'C:\\Windows\\System32\\wsl.exe',
      'C:\\Windows\\Sysnative\\wsl.exe'
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch (e) {
        // Try next candidate
      }
    }

    return null;
  }

  /**
   * Convertir un chemin Windows en chemin WSL (/mnt/<drive>/...)
   */
  toWslPath(filePath) {
    if (typeof filePath !== 'string') {
      return filePath;
    }

    const winPathMatch = filePath.match(/^([A-Za-z]):[\\/](.*)$/);
    if (!winPathMatch) {
      return filePath;
    }

    const driveLetter = winPathMatch[1].toLowerCase();
    const remainingPath = winPathMatch[2].replace(/\\/g, '/');
    return `/mnt/${driveLetter}/${remainingPath}`;
  }

  /**
   * Normaliser les formats pour qemu-img
   */
  normalizeQemuFormat(format) {
    const normalized = (format || '').toUpperCase();

    switch (normalized) {
      case 'VHD':
        return 'vpc';
      case 'VHDX':
        return 'vhdx';
      case 'QCOW2':
        return 'qcow2';
      case 'VMDK':
        return 'vmdk';
      case 'RAW':
        return 'raw';
      default:
        return normalized.toLowerCase();
    }
  }

  /**
   * Obtenir le chemin vers qemu-img selon l'OS
   */
  getQemuImgPath() {
    const platform = os.platform();
    const binDir = path.join(__dirname, '../../resources/bin');

    this.qemuMode = 'native';
    this.wslExePath = null;

    console.log('=== QEMU-IMG Detection ===');
    console.log(`  os.platform(): ${platform}`);

    if (platform === 'win32') {
      const windowsPaths = [
        path.join(binDir, 'win32', 'qemu-img.exe'),
        'C:\\Program Files\\QEMU\\qemu-img.exe',
        'C:\\Program Files (x86)\\QEMU\\qemu-img.exe'
      ];

      for (const winPath of windowsPaths) {
        if (fs.existsSync(winPath)) {
          console.log(`✓ Found qemu-img (Windows native): ${winPath}`);
          return winPath;
        }
      }

      try {
        const whereResult = execSync('where qemu-img.exe', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 2000,
          env: process.env
        }).split(/\r?\n/).map(line => line.trim()).find(Boolean);

        if (whereResult) {
          console.log(`✓ Found qemu-img (Windows PATH): ${whereResult}`);
          return whereResult;
        }
      } catch (e) {
        // Continue with WSL detection
      }

      const wslExe = Converter.getWslExecutablePath();
      if (wslExe) {
        try {
          const wslQemuPath = execFileSync(
            wslExe,
            ['-e', 'sh', '-lc', 'command -v qemu-img'],
            {
              encoding: 'utf-8',
              stdio: ['ignore', 'pipe', 'ignore'],
              timeout: 3000,
              env: process.env
            }
          ).trim();

          if (wslQemuPath) {
            this.qemuMode = 'wsl';
            this.wslExePath = wslExe;
            console.log(`✓ Found qemu-img (WSL via ${wslExe}): ${wslQemuPath}`);
            return wslQemuPath;
          }
        } catch (e) {
          console.log(`WSL detected but qemu-img not available in distro: ${e.message}`);
        }
      }

      console.log('⚠ qemu-img not found on Windows or WSL; trying PATH fallback');
      return 'qemu-img.exe';
    }

    const unixPaths = [
      '/usr/bin/qemu-img',
      '/usr/local/bin/qemu-img',
      '/opt/homebrew/bin/qemu-img'
    ];

    for (const unixPath of unixPaths) {
      if (fs.existsSync(unixPath)) {
        console.log(`✓ Found qemu-img (Unix): ${unixPath}`);
        return unixPath;
      }
    }

    try {
      const whichResult = execSync('which qemu-img', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 2000,
        env: process.env
      }).trim();

      if (whichResult) {
        console.log(`✓ Found qemu-img (PATH): ${whichResult}`);
        return whichResult;
      }
    } catch (e) {
      // fallback below
    }

    console.log('⚠ qemu-img not found on Unix; trying name fallback');
    return 'qemu-img';
  }

  /**
   * Spawn qemu-img dans le bon runtime (Windows natif ou WSL)
   */
  spawnQemuImg(args) {
    if (this.qemuMode === 'wsl' && this.wslExePath) {
      const wslArgs = ['-e', this.qemuImgPath, ...args.map(arg => this.toWslPath(arg))];
      console.log(`[WSL] ${this.wslExePath} ${JSON.stringify(wslArgs)}`);

      return spawn(this.wslExePath, wslArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: Object.assign({}, process.env)
      });
    }

    console.log(`[Native] ${this.qemuImgPath} ${JSON.stringify(args)}`);
    const options = {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: Object.assign({}, process.env)
    };

    return spawn(this.qemuImgPath, args, options);
  }

  loadHistory() {
    this.conversions = store.get('conversions', []);
  }

  saveHistory() {
    // Garder seulement les 5 dernières conversions
    store.set('conversions', this.conversions.slice(-5));
  }

  addToHistory(conversion) {
    this.conversions.push({
      id: uuidv4(),
      ...conversion,
      timestamp: new Date().toISOString()
    });
    this.saveHistory();
  }

  getHistory() {
    return this.conversions.reverse();
  }

  async convert(options, onProgress) {
    const {
      inputFile,
      outputFile,
      sourceFormat,
      destFormat,
      compression = false,
      validate = true,
      threads = 4,
      outputFolder
    } = options;

    try {
      // Validation préalable
      if (!await FileUtils.validateFile(inputFile)) {
        throw new Error('Source file invalid or inaccessible');
      }

      const finalOutputPath = outputFile || path.join(
        outputFolder,
        FileUtils.generateOutputFileName(inputFile, sourceFormat, destFormat)
      );

      onProgress({
        status: 'starting',
        message: 'Preparing conversion...',
        percentage: 0
      });

      // Estimer le temps
      const estimatedTime = await this.estimateConversionTime(options);

      // Déterminer la conversion appropriée
      let result;
      
      if (destFormat === 'QCOW2') {
        result = await this.convertToQCOW2(
          inputFile,
          finalOutputPath,
          sourceFormat,
          compression,
          threads,
          onProgress,
          estimatedTime
        );
      } else if (destFormat === 'VHD' || destFormat === 'VHDX') {
        result = await this.convertToHyperV(
          inputFile,
          finalOutputPath,
          sourceFormat,
          destFormat,
          threads,
          onProgress,
          estimatedTime
        );
      } else if (destFormat === 'VMDK') {
        result = await this.convertToVMDK(
          inputFile,
          finalOutputPath,
          sourceFormat,
          threads,
          onProgress,
          estimatedTime
        );
      } else {
        result = await this.convertToRAW(
          inputFile,
          finalOutputPath,
          sourceFormat,
          threads,
          onProgress,
          estimatedTime
        );
      }

      // Validation post-conversion
      if (validate) {
        onProgress({
          status: 'validating',
          message: 'Validating converted file...',
          percentage: 95
        });

        const isValid = await FileUtils.validateFile(finalOutputPath);
        if (!isValid) {
          throw new Error('Converted file validation failed');
        }
      }

      // Récupérer les infos du fichier résultant
      const finalStats = await FileUtils.getFileInfo(finalOutputPath);

      const conversionResult = {
        status: 'completed',
        message: 'Conversion successful!',
        percentage: 100,
        inputFile,
        outputFile: finalOutputPath,
        sourceFormat,
        destFormat,
        inputSize: options.inputSize,
        outputSize: finalStats.size,
        duration: result.duration || 0,
        compression: compression,
        threadsUsed: threads
      };

      // Ajouter à l'historique
      this.addToHistory({
        inputFile,
        outputFile: finalOutputPath,
        sourceFormat,
        destFormat,
        success: true,
        duration: result.duration || 0
      });

      onProgress(conversionResult);
      return conversionResult;

    } catch (error) {
      const errorResult = {
        status: 'error',
        message: `Error: ${error.message}`,
        percentage: 0,
        error: error.message
      };

      // Log de l'erreur dans l'historique
      this.addToHistory({
        inputFile: options.inputFile,
        sourceFormat,
        destFormat,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Conversion vers QCOW2
   * Utilise cross-spawn pour cross-platform
   */
  async convertToQCOW2(input, output, sourceFormat, compression, threads, onProgress, estimatedTime) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const args = [
        'convert',
        '-f', this.normalizeQemuFormat(sourceFormat),
        '-O', 'qcow2',
        '-p'
      ];
      
      if (compression) {
        args.push('-c');
      }
      
      args.push(input);
      args.push(output);

      const process = this.spawnQemuImg(args);
      let lastProgress = 0;

      process.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/\((\d+)\.?\d*%\)/);
        if (match) {
          const progress = parseInt(match[1]);
          if (progress > lastProgress) {
            lastProgress = progress;
            onProgress({
              status: 'converting',
              message: `QCOW2 Conversion: ${progress}%`,
              percentage: progress,
              estimatedTime: estimatedTime.estimatedSeconds * (100 - progress) / 100
            });
          }
        }
      });

      process.stderr.on('data', (data) => {
        console.error(`qemu-img: ${data}`);
      });

      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code === 0) {
          resolve({ success: true, duration });
        } else {
          reject(new Error(`QCOW2 conversion failed (code: ${code})`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`qemu-img error: ${error.message}`));
      });
    });
  }

  /**
   * Conversion vers VHD/VHDX
   */
  async convertToHyperV(input, output, sourceFormat, format, threads, onProgress, estimatedTime) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const args = [
        'convert',
        '-f', this.normalizeQemuFormat(sourceFormat),
        '-O', this.normalizeQemuFormat(format),
        input,
        output
      ];

      const process = this.spawnQemuImg(args);

      process.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/\((\d+)\.?\d*%\)/);
        if (match) {
          const progress = parseInt(match[1]);
          onProgress({
            status: 'converting',
            message: `${format} Conversion: ${progress}%`,
            percentage: progress,
            estimatedTime: estimatedTime.estimatedSeconds * (100 - progress) / 100
          });
        }
      });

      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code === 0) {
          resolve({ success: true, duration });
        } else {
          reject(new Error(`${format} conversion failed`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`${format} conversion error: ${error.message}`));
      });
    });
  }

  /**
   * Conversion vers VMDK
   */
  async convertToVMDK(input, output, sourceFormat, threads, onProgress, estimatedTime) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const args = [
        'convert',
        '-f', this.normalizeQemuFormat(sourceFormat),
        '-O', 'vmdk',
        input,
        output
      ];

      const process = this.spawnQemuImg(args);

      process.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/\((\d+)\.?\d*%\)/);
        if (match) {
          const progress = parseInt(match[1]);
          onProgress({
            status: 'converting',
            message: `VMDK Conversion: ${progress}%`,
            percentage: progress,
            estimatedTime: estimatedTime.estimatedSeconds * (100 - progress) / 100
          });
        }
      });

      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code === 0) {
          resolve({ success: true, duration });
        } else {
          reject(new Error('VMDK conversion failed'));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`VMDK conversion error: ${error.message}`));
      });
    });
  }

  /**
   * Conversion vers RAW
   */
  async convertToRAW(input, output, sourceFormat, threads, onProgress, estimatedTime) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const args = [
        'convert',
        '-f', this.normalizeQemuFormat(sourceFormat),
        '-O', 'raw',
        input,
        output
      ];

      const process = this.spawnQemuImg(args);

      process.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/\((\d+)\.?\d*%\)/);
        if (match) {
          const progress = parseInt(match[1]);
          onProgress({
            status: 'converting',
            message: `RAW Conversion: ${progress}%`,
            percentage: progress,
            estimatedTime: estimatedTime.estimatedSeconds * (100 - progress) / 100
          });
        }
      });

      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code === 0) {
          resolve({ success: true, duration });
        } else {
          reject(new Error('RAW conversion failed'));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`RAW conversion error: ${error.message}`));
      });
    });
  }

  /**
   * Estimer le temps de conversion
   * Basé sur la taille du fichier
   */
  async estimateConversionTime(options) {
    // Vitesse moyenne: ~50MB/s
    const fileSize = options.inputSize || (1024 * 1024 * 1024); // 1GB par défaut
    const avgSpeed = 50 * 1024 * 1024;
    const estimatedSeconds = Math.ceil(fileSize / avgSpeed);

    return {
      estimatedSeconds,
      estimatedTime: FileUtils.formatTime(estimatedSeconds * 1000)
    };
  }
}

module.exports = { Converter };
