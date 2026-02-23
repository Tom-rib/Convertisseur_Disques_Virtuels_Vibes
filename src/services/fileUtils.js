const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

class FileUtils {
  /**
   * Déterminer le format du disque virtuel
   * Basé sur la signature du fichier (magic bytes)
   */
  static async detectFormat(filePath) {
    try {
      const buffer = Buffer.alloc(512);
      const fd = await fs.open(filePath, 'r');
      await fd.read(buffer, 0, 512, 0);
      await fd.close();

      const data = buffer.toString('latin1', 0, 128);

      // Détection VMDK
      if (data.includes('# Disk DescriptorFile')) {
        return 'VMDK';
      }

      // Détection VDI (innotek)
      if (buffer.toString('latin1', 0, 4) === 'CON\n') {
        return 'VDI';
      }

      // Détection VHD
      if (data.includes('conectix')) {
        return 'VHD';
      }

      // Détection VHDX
      if (buffer.toString('hex', 0, 8) === '766868647825000000') {
        return 'VHDX';
      }

      // Détection QCOW2
      if (buffer.toString('hex', 0, 4) === '514649fb') {
        return 'QCOW2';
      }

      // Fichier brut (RAW)
      return 'RAW';
    } catch (error) {
      console.error('Format detection error:', error);
      return 'UNKNOWN';
    }
  }

  /**
   * Valider un fichier de disque virtuel
   */
  static async validateFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      // Vérifier que c'est un fichier
      if (!stats.isFile()) {
        return false;
      }

      // Vérifier la taille minimale (au moins 1KB)
      if (stats.size < 1024) {
        return false;
      }

      // Vérifier les permissions de lecture
      await fs.access(filePath, fs.constants.R_OK);
      
      return true;
    } catch (error) {
      console.error('File validation error:', error);
      return false;
    }
  }

  /**
   * Obtenir les infos d'un fichier
   */
  static async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const format = await this.detectFormat(filePath);

      return {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        format: format,
        modified: stats.mtime,
        created: stats.birthtime,
        readable: true
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }

  /**
   * Obtenir l'espace disque disponible et utilisé
   * Cross-platform: Windows, macOS, Linux
   */
  static async getFreeDiskSpace(dirPath) {
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        return this.getFreeDiskSpaceWindows(dirPath);
      } else if (platform === 'darwin') {
        return this.getFreeDiskSpaceMac(dirPath);
      } else if (platform === 'linux') {
        return this.getFreeDiskSpaceLinux(dirPath);
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      console.error('Error getting disk space:', error);
      throw error;
    }
  }

  /**
   * Windows disk space (PowerShell)
   */
  static async getFreeDiskSpaceWindows(dirPath) {
    return new Promise((resolve, reject) => {
      try {
        // Utiliser PowerShell pour obtenir l'espace disque
        const drive = path.parse(dirPath).root;
        
        // Créer une commande PowerShell qui gère correctement les chemins avec espaces
        // Utiliser [System.IO.DriveInfo] qui est plus robuste
        const command = `[System.IO.DriveInfo]'${drive.slice(0, 1)}' | Select-Object -ExpandProperty AvailableFreeSpace`;
        
        const result = execSync(`powershell -Command "${command.replace(/"/g, '\\"')}"`, { 
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        
        const freeDiskSpace = parseInt(result) || 0;

        resolve({
          available: freeDiskSpace,
          used: 0, // Non disponible facilement
          total: freeDiskSpace, // Estimation
          percentage: 0
        });
      } catch (error) {
        console.error('Failed to get disk space, using default:', error.message);
        // Fallback: retourner une valeur par défaut plutôt que d'échouer
        resolve({
          available: 1099511627776, // 1 TB default
          used: 0,
          total: 1099511627776,
          percentage: 0
        });
      }
    });
  }

  /**
   * macOS disk space (df)
   */
  static async getFreeDiskSpaceMac(dirPath) {
    return new Promise((resolve, reject) => {
      const process = spawn('df', ['-k', dirPath]);
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          const lines = output.trim().split('\n');
          if (lines.length > 1) {
            const parts = lines[1].split(/\s+/);
            const available = parseInt(parts[3]) * 1024; // Convert from KB to bytes
            const total = parseInt(parts[1]) * 1024;
            const used = total - available;

            resolve({
              available: available,
              used: used,
              total: total,
              percentage: Math.round((used / total) * 100)
            });
          } else {
            reject(new Error('Invalid df output format'));
          }
        } else {
          reject(new Error(`df command failed with code ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to get macOS disk space: ${error.message}`));
      });
    });
  }

  /**
   * Linux disk space (df)
   */
  static async getFreeDiskSpaceLinux(dirPath) {
    return new Promise((resolve, reject) => {
      const process = spawn('df', ['-B1', dirPath]);
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          const lines = output.trim().split('\n');
          if (lines.length > 1) {
            const parts = lines[1].split(/\s+/);
            const available = parseInt(parts[3]);
            const total = parseInt(parts[1]);
            const used = total - available;

            resolve({
              available: available,
              used: used,
              total: total,
              percentage: Math.round((used / total) * 100)
            });
          } else {
            reject(new Error('Invalid df output format'));
          }
        } else {
          reject(new Error(`df command failed with code ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to get Linux disk space: ${error.message}`));
      });
    });
  }

  /**
   * Obtenir le dossier de sortie par défaut
   * Utilise le dossier Documents de l'utilisateur
   */
  static getDefaultOutputFolder() {
    return path.join(os.homedir(), 'Documents', 'VirtualDiskConverter');
  }

  /**
   * Générer un nom de fichier de sortie
   */
  static generateOutputFileName(inputFile, sourceFormat, destFormat) {
    const baseName = path.basename(inputFile, path.extname(inputFile));
    const timestamp = new Date().toISOString().split('T')[0];
    
    const formatExtensions = {
      VMDK: '.vmdk',
      VDI: '.vdi',
      VHD: '.vhd',
      VHDX: '.vhdx',
      QCOW2: '.qcow2',
      RAW: '.raw'
    };

    const ext = formatExtensions[destFormat] || '.img';
    return `${baseName}_${sourceFormat.toUpperCase()}_to_${destFormat.toUpperCase()}_${timestamp}${ext}`;
  }

  /**
   * Formater une durée en millisecondes en chaîne lisible
   */
  static formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Formater des bytes en chaîne lisible
   */
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Vérifier si un dossier est accessible en écriture
   */
  static async isWritable(dirPath) {
    try {
      await fs.access(dirPath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Créer un dossier s'il n'existe pas
   */
  static async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Obtenir le chemin du dossier temporaire
   */
  static getTempDir() {
    return os.tmpdir();
  }

  /**
   * Obtenir le chemin du répertoire personnel
   */
  static getHomeDir() {
    return os.homedir();
  }

  /**
   * Vérifier la compatibilité entre deux formats
   */
  static isConversionPossible(sourceFormat, destFormat) {
    const compatibilityMatrix = {
      VMDK: ['VHD', 'VHDX', 'QCOW2', 'RAW'],
      VHD: ['VMDK', 'VHDX', 'QCOW2', 'RAW'],
      VHDX: ['VMDK', 'VHD', 'QCOW2', 'RAW'],
      QCOW2: ['VMDK', 'VHD', 'VHDX', 'RAW'],
      RAW: ['VMDK', 'VHD', 'VHDX', 'QCOW2'],
      VDI: ['VMDK', 'VHD', 'VHDX', 'QCOW2', 'RAW']
    };

    if (!compatibilityMatrix[sourceFormat]) {
      return false;
    }

    return compatibilityMatrix[sourceFormat].includes(destFormat);
  }
}

module.exports = { FileUtils };
