export namespace main {
	
	export class Profile {
	    id: string;
	    name: string;
	    folderId?: string;
	    host: string;
	    color?: string;
	    notes?: string;
	    theme?: string;
	    remoteCommand?: string;
	    ssh: SSHOptions;
	    createdAt: number;
	    lastUsedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.folderId = source["folderId"];
	        this.host = source["host"];
	        this.color = source["color"];
	        this.notes = source["notes"];
	        this.theme = source["theme"];
	        this.remoteCommand = source["remoteCommand"];
	        this.ssh = this.convertValues(source["ssh"], SSHOptions);
	        this.createdAt = source["createdAt"];
	        this.lastUsedAt = source["lastUsedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Folder {
	    id: string;
	    name: string;
	    parentId?: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Folder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.parentId = source["parentId"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class SSHOptions {
	    user?: string;
	    port?: number;
	    identityFile?: string;
	    proxyJump?: string;
	    socksProxy?: string;
	    serverAliveInterval?: number;
	    serverAliveCountMax?: number;
	    connectTimeout?: number;
	    strictHostKeyChecking?: string;
	    compression?: boolean;
	    forwardAgent?: boolean;
	    identitiesOnly?: boolean;
	    localForwards?: string[];
	    remoteForwards?: string[];
	    dynamicForwards?: string[];
	    options?: string[];
	    extraArgs?: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user = source["user"];
	        this.port = source["port"];
	        this.identityFile = source["identityFile"];
	        this.proxyJump = source["proxyJump"];
	        this.socksProxy = source["socksProxy"];
	        this.serverAliveInterval = source["serverAliveInterval"];
	        this.serverAliveCountMax = source["serverAliveCountMax"];
	        this.connectTimeout = source["connectTimeout"];
	        this.strictHostKeyChecking = source["strictHostKeyChecking"];
	        this.compression = source["compression"];
	        this.forwardAgent = source["forwardAgent"];
	        this.identitiesOnly = source["identitiesOnly"];
	        this.localForwards = source["localForwards"];
	        this.remoteForwards = source["remoteForwards"];
	        this.dynamicForwards = source["dynamicForwards"];
	        this.options = source["options"];
	        this.extraArgs = source["extraArgs"];
	    }
	}
	export class Settings {
	    sshPath?: string;
	    confirmCloseActive: boolean;
	    closeOnCleanExit: boolean;
	    ssh: SSHOptions;
	    terminal?: any;
	    ui?: any;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sshPath = source["sshPath"];
	        this.confirmCloseActive = source["confirmCloseActive"];
	        this.closeOnCleanExit = source["closeOnCleanExit"];
	        this.ssh = this.convertValues(source["ssh"], SSHOptions);
	        this.terminal = source["terminal"];
	        this.ui = source["ui"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppData {
	    version: number;
	    settings: Settings;
	    folders: Folder[];
	    profiles: Profile[];
	
	    static createFrom(source: any = {}) {
	        return new AppData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.settings = this.convertValues(source["settings"], Settings);
	        this.folders = this.convertValues(source["folders"], Folder);
	        this.profiles = this.convertValues(source["profiles"], Profile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConnectResult {
	    sessionId: string;
	    command: string;
	    lastUsedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ConnectResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.command = source["command"];
	        this.lastUsedAt = source["lastUsedAt"];
	    }
	}
	export class EnvInfo {
	    os: string;
	    sshPath: string;
	    detectedSshPath: string;
	    sshVersion: string;
	    dataPath: string;
	    sshConfigPath: string;
	
	    static createFrom(source: any = {}) {
	        return new EnvInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.os = source["os"];
	        this.sshPath = source["sshPath"];
	        this.detectedSshPath = source["detectedSshPath"];
	        this.sshVersion = source["sshVersion"];
	        this.dataPath = source["dataPath"];
	        this.sshConfigPath = source["sshConfigPath"];
	    }
	}
	
	export class ImportResult {
	    path: string;
	    count: number;
	    data: AppData;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.count = source["count"];
	        this.data = this.convertValues(source["data"], AppData);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

