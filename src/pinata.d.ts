declare module "pinata" {
	interface PinataConfig {
		pinataJwt: string;
		pinataGateway?: string;
	}

	interface PinataFile {
		id: string;
		user_id: string;
		group_id: string | null;
		name: string;
		cid: string;
		created_at: string;
		size: number;
		number_of_files: number;
		mime_type: string;
		vectorized: boolean;
		network: string;
	}

	interface PinataFileList {
		items: PinataFile[];
		total: number;
		has_next: boolean;
	}

	interface ListOptions {
		page?: number;
		pageSize?: number;
		name?: string;
		cid?: string;
		group_id?: string;
		mime_type?: string;
		network?: string;
		created_gt?: string;
		created_lt?: string;
		updated_gt?: string;
		updated_lt?: string;
	}

	interface ImageOptimizationOptions {
		width?: number;
		height?: number;
		quality?: number;
		format?: "auto" | "jpeg" | "png" | "webp" | "gif";
		fit?: "cover" | "contain" | "fill" | "inside" | "outside";
		background?: string;
	}

	interface PinataMetadata {
		name?: string;
		keyvalues?: Record<string, any>;
	}

	interface PinataOptions {
		cidVersion?: number;
	}

	interface PinataUploadOptions {
		pinataOptions?: PinataOptions;
		pinataMetadata?: PinataMetadata;
	}

	interface PinataUploadResponse {
		id: string;
		user_id: string;
		group_id: string | null;
		name: string;
		cid: string;
		created_at: string;
		size: number;
		number_of_files: number;
		mime_type: string;
		vectorized: boolean;
		network: string;
	}

	interface PinataAccessTokenResponse {
		accessUrl: string;
		expiresAt: number;
	}

	interface PinataGatewayResponse {
		url: string;
	}

	export class PinataSDK {
		constructor(config: PinataConfig);

		// File Upload Methods
		upload: {
			public: {
				file(file: File | Blob): Promise<PinataFile>;
				folder(files: File[] | Blob[]): Promise<PinataFile>;
			};
			private: {
				file(file: File | Blob): Promise<PinataFile>;
				folder(files: File[] | Blob[]): Promise<PinataFile>;
			};
		};

		// File Management Methods
		files: {
			list(options?: ListOptions): Promise<PinataFileList>;
			delete(id: string): Promise<void>;
			get(id: string): Promise<PinataFile>;
		};

		// Gateway Methods
		gateways: {
			public: {
				get(
					cid: string,
					options?: ImageOptimizationOptions
				): Promise<{ url: string }>;
			};
			private: {
				get(
					cid: string,
					options?: ImageOptimizationOptions
				): Promise<{ url: string }>;
			};
		};
	}
}
