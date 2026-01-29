-- DuckDB transformation query
-- TODO: Implement your own transformations
--
-- This file is read by process.py and executed against the raw JSON data.
-- The {input_path} placeholder will be replaced with the GCS path.
--
-- Example:
--
with
    renamed as (
        from raw
        select
            job_id,
            agency,
            posting_type,
            number_of_positions,
            business_title,
            civil_service_title,
            title_classification,
            title_code_no,
            level,
            job_category,
            career_level,
            cast(salary_range_from as double) as salary_range_from,
            cast(salary_range_to as double) as salary_range_to,
            full_time_part_time_indicator,
            salary_frequency,
            work_location,
            division_work_unit,
            job_description,
            minimum_qual_requirements,
            residency_requirement,
            posting_date::date as posted_date,
            strptime(post_until, '%d-%b-%Y')::date as posted_until_date,
            posting_updated::date as posting_updated_date,
            process_date::date as processed_date,
    ),
    columns_added as (
        from renamed
        select
            renamed.*,
            (title_classification = 'Competitive-1') as requires_exam,
            (full_time_part_time_indicator = 'F') as is_full_time,
            -- job_category may contain multiple categories each containing spaces
            -- concatenated together with spaces...
            -- Split job_category into array by replacing known categories with
            -- delimited versions
            -- Order matters: longer categories first to avoid partial matches (e.g.,
            -- "Mental Health" before "Health")
        -- fmt: off
        list_transform(
            list_filter(
                str_split(
                    replace(replace(replace(replace(replace(replace(replace(
                    replace(replace(replace(replace(replace(replace(replace(
                        job_category,
                        'Communications & Intergovernmental Affairs', '|Communications & Intergovernmental Affairs'),
                        'Constituent Services & Community Programs', '|Constituent Services & Community Programs'),
                        'Public Safety, Inspections, & Enforcement', '|Public Safety, Inspections, & Enforcement'),
                        'Engineering, Architecture, & Planning', '|Engineering, Architecture, & Planning'),
                        'Finance, Accounting, & Procurement', '|Finance, Accounting, & Procurement'),
                        'Building Operations & Maintenance', '|Building Operations & Maintenance'),
                        'Administration & Human Resources', '|Administration & Human Resources'),
                        'Technology, Data & Innovation', '|Technology, Data & Innovation'),
                        'Policy, Research & Analysis', '|Policy, Research & Analysis'),
                        'Social Services', '|Social Services'),
                        'Mental Health', '|Mental Health'),
                        'Legal Affairs', '|Legal Affairs'),
                        'Green Jobs', '|Green Jobs'),
                        'Health', '|Health'),
                    '|'),
                x -> length(x) > 0
            ),
            x -> trim(x)
        ) as job_categories,
        -- fmt: on
    )

from columns_added
select md5(columns_added::varchar) as id, columns_added.*
