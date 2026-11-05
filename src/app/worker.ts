/** The app's engine worker: smaltdb with the plugins the example flow needs, smaltfl's runtime among them. */
import { serve } from 'smaltdb/worker-runtime';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../plugin/index.js';

serve({ plugins: [io, external, parquet, smaltfl] });
