import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateBusinessPlanDto {
    @IsString()
    @IsNotEmpty()
    business_idea: string;

    @IsString()
    @IsNotEmpty()
    industry: string;

    @IsString()
    @IsNotEmpty()
    target_audience: string;

    @IsString()
    @IsNotEmpty()
    skills: string;

    @IsString()
    @IsNotEmpty()
    budget: string;

    @IsString()
    @IsNotEmpty()
    location: string;

    @IsString()
    @IsNotEmpty()
    experience_level: string;

    @IsString()
    @IsNotEmpty()
    goal: string;
}