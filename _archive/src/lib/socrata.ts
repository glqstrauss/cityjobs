export interface SocrataConfig {
  baseUrl: string;
  datasetId: string;
  appKeyId?: string;
  appKeySecret?: string;
}

export interface DatasetMetadata {
  id: string;
  name: string;
  updatedAt: string;
  dataUpdatedAt: string;
}

export interface SocrataJob {
  job_id: string;
  agency: string;
  posting_type: string;
  number_of_positions: string;
  business_title: string;
  civil_service_title: string;
  title_classification: string;
  title_code_no: string;
  level: string;
  job_category: string;
  full_time_part_time_indicator: string;
  career_level: string;
  salary_range_from: string;
  salary_range_to: string;
  salary_frequency: string;
  work_location: string;
  work_location_1?: string;
  division_work_unit: string;
  job_description: string;
  minimum_qual_requirements: string;
  preferred_skills?: string;
  residency_requirement?: string;
  posting_date: string;
  post_until?: string;
  posting_updated: string;
  process_date: string;
}

export class SocrataClient {
  private config: SocrataConfig;

  constructor(config: SocrataConfig) {
    this.config = config;
  }

  private getAuthHeaders(): HeadersInit {
    if (this.config.appKeyId && this.config.appKeySecret) {
      return {
        Authorization: `Basic ${btoa(`${this.config.appKeyId}:${this.config.appKeySecret}`)}`,
      };
    }
    return {};
  }

  async getMetadata(): Promise<DatasetMetadata> {
    const url = `${this.config.baseUrl}/api/views/metadata/v1/${this.config.datasetId}`;
    const response = await fetch(url, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async fetchAllData(): Promise<SocrataJob[]> {
    const allRecords: SocrataJob[] = [];
    const limit = 10000;
    let offset = 0;

    while (true) {
      const batch = await this.fetchPage(limit, offset);
      allRecords.push(...batch);

      if (batch.length < limit) {
        break;
      }
      offset += limit;
    }

    return allRecords;
  }

  private async fetchPage(limit: number, offset: number): Promise<SocrataJob[]> {
    const url = `${this.config.baseUrl}/resource/${this.config.datasetId}.json?$limit=${limit}&$offset=${offset}`;
    const response = await fetch(url, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
